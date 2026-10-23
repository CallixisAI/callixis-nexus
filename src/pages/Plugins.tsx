import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Check,
  Settings,
  Send,
  Sparkles,
  AlertCircle,
  Info,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { describeFunctionError } from "@/lib/functionError";
import type { Database } from "@/integrations/supabase/types";
import { CATEGORY_PROVIDERS, type ProviderOption } from "@/lib/providerSpecs";
import {
  PLUGIN_REGISTRY,
  pluginById,
  visibleConfigFields,
  isPluginConfigured,
  missingRequiredFields,
  type PluginSpec,
  type PluginReadiness,
} from "@/lib/plugins";

// Plugins plan (docs/plugins-plan/README.md) — this page used to hardcode its own 4-plugin
// catalogue (Plugins.tsx:71-133 before this change) and conflate "has this user clicked
// Enable" with "does this actually do anything" (the initial-commit version of this exact page,
// ca46717, hardcoded a green "Active" badge as a string literal — see the plan doc's own
// opening section). §A's honesty model fixes that at the type level: `readiness` (src/lib/
// plugins.ts, a fact about the repo) is never rendered as if it were `enabled` (user_plugins.
// status, a fact about this one user).

type PluginRow = Database["public"]["Tables"]["user_plugins"]["Row"];
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// §D.8, revised at James's request 2026-09-22 (twice — first "planned" plugins, then "managed"
// ones too): every plugin can now be manually switched on and configured, regardless of
// readiness. What the BADGE shows never depends on that switch for anything except `live` —
// that's the one place "enabled" is also genuinely true. This is the mechanism that keeps D-6's
// original concern (a green dot implying a real connection that doesn't exist) from coming back
// just because the buttons did:
//   - `live`  — enabled AND configured is a real fact ("Connected", emerald); otherwise "Needs
//               setup" (amber). The only readiness where the switch changes anything real.
//   - `managed` — ALWAYS "Running" (sky), whatever the switch says. These already run for real,
//               controlled by Callixis, not by this page — the switch here is a personal
//               bookmark with zero effect, and the badge has to keep telling the truth
//               regardless of what a user clicks.
//   - `planned` — "Marked on" (violet) when switched on, "Not available yet" (muted) otherwise.
//               Never "Connected" — that's the exact bug this whole plan exists to end.
function cardBadge(readiness: PluginReadiness, enabled: boolean, configured: boolean): { label: string; className: string } {
  if (readiness === "live") {
    return enabled && configured
      ? { label: "Connected", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" }
      : { label: "Needs setup", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  }
  if (readiness === "managed") {
    return { label: "Running", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" };
  }
  // planned
  return enabled
    ? { label: "Marked on", className: "bg-violet-500/10 text-violet-400 border-violet-500/20" }
    : { label: "Not available yet", className: "bg-secondary text-muted-foreground border-border" };
}

// James, 2026-09-22: display order only, no header text — see the render for why.
const GROUP_ORDER: PluginReadiness[] = ["live", "managed", "planned"];

async function streamChat({ messages, pluginId, readiness, onDelta, onDone, onError }: {
  messages: ChatMessage[];
  pluginId: string;
  readiness: PluginReadiness;
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  try {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plugin-setup-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify({ messages, pluginId, readiness }),
    });
    if (!resp.ok) throw new Error("Failed to connect");
    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("No reader");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data: ")) continue;
        const data = line.replace("data: ", "").trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          // Ignore malformed SSE chunks.
        }
      }
    }
    onDone();
  } catch {
    onError("Plugin setup assistant is unavailable right now.");
  }
}

const IntegrationSheet = ({
  plugin,
  open,
  onOpenChange,
  onConfigSaved,
  initialConfig,
  configuredSecretKeys,
}: {
  plugin: PluginSpec | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfigSaved: (spec: PluginSpec, config: Record<string, string>, secretValues: Record<string, string>) => void;
  initialConfig?: Record<string, string>;
  /** Which of this plugin's secret fields are already set in Vault — not a setter. */
  configuredSecretKeys: ReadonlySet<string>;
}) => {
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (plugin && open) {
      setConfigValues(initialConfig || {});
      setSecretValues({});
      const opening =
        plugin.readiness === "planned"
          ? `${plugin.name} hasn't been built yet — nothing you save here changes any real behaviour today. I can help you note preferences for later.`
          : `I can help explain the ${plugin.name} fields. Saving is the only guaranteed working action here.`;
      setMessages([{ role: "assistant", content: opening }]);
    }
  }, [plugin, open, initialConfig]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!plugin) return null;
  const Icon = plugin.icon;
  const fields = visibleConfigFields(plugin);

  const handleChatSend = async () => {
    if (!chatInput.trim() || isStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setChatInput("");
    setIsStreaming(true);
    let assistantSoFar = "";
    await streamChat({
      messages: newMsgs,
      pluginId: plugin.id,
      readiness: plugin.readiness,
      onDelta: (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > newMsgs.length) {
            return prev.map((message, index) => index === prev.length - 1 ? { ...message, content: assistantSoFar } : message);
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      },
      onDone: () => setIsStreaming(false),
      onError: (msg: string) => {
        toast.error(msg);
        setIsStreaming(false);
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-4xl w-full bg-card border-border flex flex-col p-0" side="right">
        <SheetHeader className="p-6 border-b border-border shrink-0 flex flex-row items-center gap-4">
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
          <div>
            <SheetTitle>{plugin.name}</SheetTitle>
            <SheetDescription>
              {plugin.readiness === "planned"
                ? "Not built yet — record preferences for when it is."
                : "Save credentials and notes for this integration"}
            </SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border p-6 overflow-auto space-y-6">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration</h3>
              <p className="text-xs text-muted-foreground mt-1">{plugin.detail}</p>
            </div>
            {fields.map((field) => {
              if (field.secret) {
                const isSet = configuredSecretKeys.has(field.key);
                return (
                  <div key={field.key} className="space-y-2">
                    <Label className="text-xs flex items-center gap-1"><KeyRound className="h-3 w-3" /> {field.label}{field.required && " *"}</Label>
                    {isSet && !secretValues[field.key] && (
                      <p className="text-[11px] text-emerald-400">Key is set. Leave blank to keep it, or enter a new value to replace it.</p>
                    )}
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder={isSet ? "Enter a new value to replace the saved key" : field.placeholder}
                      value={secretValues[field.key] || ""}
                      onChange={(event) => setSecretValues({ ...secretValues, [field.key]: event.target.value })}
                      className="bg-secondary"
                    />
                    {field.help && <p className="text-[10px] text-muted-foreground">{field.help}</p>}
                    <p className="text-[10px] text-muted-foreground/70">Stored so it can never be read back from the browser. This page cannot show you the value again.</p>
                  </div>
                );
              }
              return (
                <div key={field.key} className="space-y-2">
                  <Label className="text-xs">{field.label}{field.required && " *"}</Label>
                  <Input type={field.type === "url" || field.type === "email" ? field.type : "text"} value={configValues[field.key] || ""} onChange={(event) => setConfigValues({ ...configValues, [field.key]: event.target.value })} className="bg-secondary" />
                  {field.help && <p className="text-[10px] text-muted-foreground">{field.help}</p>}
                </div>
              );
            })}
            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing to configure yet.</p>
            )}
            <Button onClick={() => onConfigSaved(plugin, configValues, secretValues)} className="w-full glow-cyan">Save Settings</Button>
          </div>
          <div className="w-1/2 flex flex-col bg-secondary/20">
            <div className="p-3 border-b border-border text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><Sparkles className="h-3 w-3 text-primary" /> Optional Assistant</div>
            <ScrollArea className="flex-1 p-4">
              <div ref={scrollRef} className="space-y-4">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] p-2 rounded text-xs ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>{message.content}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-border flex gap-2">
              <Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about the config fields..." onKeyDown={(event) => event.key === "Enter" && handleChatSend()} className="h-9 text-xs" />
              <Button onClick={handleChatSend} size="icon" className="h-9 w-9 shrink-0"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const ActivateDialog = ({
  plugin,
  open,
  onOpenChange,
  onActivate,
}: {
  plugin: PluginSpec | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onActivate: (id: string) => void;
}) => {
  if (!plugin) return null;
  const Icon = plugin.icon;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" /> {plugin.readiness === "live" ? "Activate Plugin" : "Mark as On"}</DialogTitle>
          <DialogDescription>
            {plugin.readiness === "planned" &&
              "This isn't built yet — marking it on is a personal tracking flag only. It will show as \"Marked on\", not \"Connected\", and nothing about how the app behaves changes."}
            {plugin.readiness === "managed" &&
              "This already runs for real, configured by the Callixis team — this switch is a personal bookmark for you and doesn't start, stop, or change anything. The badge will keep saying \"Running\" either way."}
            {plugin.readiness === "live" &&
              "Activation marks the integration as enabled in the database. It does not validate credentials or provision the provider."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 py-4">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
          <div>
            <p className="text-sm font-bold text-foreground">{plugin.name}</p>
            <p className="text-xs text-muted-foreground">{plugin.summary}</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onActivate(plugin.id)} className="w-full glow-cyan">{plugin.readiness === "live" ? "Mark Active" : "Mark as On"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PluginCard = ({
  plugin,
  enabled,
  configured,
  onActivate,
  onDeactivate,
  onSetup,
  canManage,
}: {
  plugin: PluginSpec;
  enabled: boolean;
  configured: boolean;
  onActivate: (p: PluginSpec) => void;
  onDeactivate: (p: PluginSpec) => void;
  onSetup: (p: PluginSpec) => void;
  canManage: boolean;
}) => {
  const Icon = plugin.icon;
  const { label: badgeLabel, className: badgeClass } = cardBadge(plugin.readiness, enabled, configured);
  // James, 2026-09-22 (both asks): every plugin gets Config and Enable/Disable, including
  // "managed" ones — the honesty guard lives in cardBadge() above (a "managed" card's badge
  // never changes with this switch) and in the confirmation copy below, not in hiding the
  // button.
  const canConfigure = visibleConfigFields(plugin).length > 0;
  const canToggle = true;

  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all group">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Icon className="h-6 w-6 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground truncate">{plugin.name}</h3>
              <Badge variant="outline" className={`text-[10px] uppercase font-bold ${badgeClass}`}>{badgeLabel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plugin.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {plugin.features.map((feature) => (
                <span key={feature} className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground">{feature}</span>
              ))}
            </div>
            {/* A second, separate chip for "have you filled in what's needed" — independent of
                the top-right badge, which is the one that's never allowed to overclaim a real
                connection. Skipped for `managed`: its fields are cosmetic notes only, nothing is
                ever required, so this chip would always trivially read "Config Saved" and tell
                you nothing — the "runs regardless" line below is the honest thing to show there
                instead. */}
            {plugin.readiness !== "managed" && (
              <div className="mt-3 flex items-center gap-1">
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${configured ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                  {configured ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {configured ? "Config Saved" : "Needs Config"}
                </div>
              </div>
            )}
            {(plugin.readiness === "live" || plugin.readiness === "managed") && plugin.whereReal && (
              <p className="text-[10px] text-muted-foreground/70 mt-2 italic flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" /> {plugin.whereReal}
              </p>
            )}
            {plugin.readiness === "planned" && (
              <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <AlertCircle className="h-3 w-3" /> Nothing connected
              </div>
            )}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Provider: <span className="text-foreground">{plugin.provider}</span></p>
              <div className="flex gap-2">
                {canManage && canConfigure && <Button variant="outline" size="sm" className="h-8 text-xs border-border bg-secondary/50" onClick={() => onSetup(plugin)}><Settings className="h-3 w-3 mr-1" /> Config</Button>}
                {canManage && canToggle && (enabled ? <Button variant="outline" size="sm" className="h-8 text-xs border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => onDeactivate(plugin)}>Disable</Button> : <Button size="sm" className="h-8 text-xs glow-cyan" onClick={() => onActivate(plugin)}>Enable</Button>)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Plugins = () => {
  const { user, hasPermission } = useAuth();
  // Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §E/[E24]) — was gated on
  // `isAdmin`, but `user_plugins` is strictly per-user (UNIQUE(user_id, plugin_id), own-row
  // RLS, fetched with .eq("user_id", user.id) below): an admin pressing Config only ever
  // edited *their own* row, and the user who actually owns the row that matters — the n8n
  // webhook URL, "the entire integration" per this repo's CLAUDE.md — had no way to set it.
  // §E's decision: gate on the `plugins` permission instead, which Phase 1 §7.5 already
  // grants to every role (James, 2026-08-12: "everyone can see it"), so this stops being an
  // admin-only feature without needing a data-model change.
  const canManagePlugins = hasPermission("plugins");
  const [dbPlugins, setDbPlugins] = useState<PluginRow[]>([]);
  // Plugins plan §E.3 — metadata only ("is a secret set"), keyed "pluginId::fieldKey". Best-
  // effort: user_plugin_secrets doesn't exist live yet (⛔ migration not applied — see
  // CLAUDE.md), so this fetch is expected to fail until then. It fails SILENTLY (no toast) on
  // purpose — showing an error on every page load for a table that's deliberately not live yet
  // would be its own bug, not a helpful warning.
  const [secretMeta, setSecretMeta] = useState<Set<string>>(new Set());
  const [activateTarget, setActivateTarget] = useState<PluginSpec | null>(null);
  const [setupTarget, setSetupTarget] = useState<PluginSpec | null>(null);
  const [addIntegrationOpen, setAddIntegrationOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("voips");
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
  const [newIntegrationFields, setNewIntegrationFields] = useState<Record<string, string>>({});

  const fetchPlugins = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("user_plugins").select("*").eq("user_id", user.id);
      if (error) throw error;
      setDbPlugins(data || []);
    } catch (err) {
      toast.error(errorMessage(err) || "Failed to load plugins.");
    }
  }, [user]);

  const fetchSecretMeta = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("user_plugin_secrets").select("plugin_id, field_key").eq("user_id", user.id);
      if (error) throw error;
      setSecretMeta(new Set((data || []).map((row) => `${row.plugin_id}::${row.field_key}`)));
    } catch (err) {
      console.warn("plugin secret metadata unavailable (expected until the vault migration is live):", errorMessage(err));
      setSecretMeta(new Set());
    }
  }, [user]);

  useEffect(() => {
    fetchPlugins();
    fetchSecretMeta();
  }, [fetchPlugins, fetchSecretMeta]);

  const secretKeysFor = useCallback(
    (pluginId: string) => new Set([...secretMeta].filter((k) => k.startsWith(`${pluginId}::`)).map((k) => k.split("::")[1])),
    [secretMeta]
  );

  // James, 2026-09-22 (both asks): every plugin can be manually switched on, including the
  // "managed" ones that already run for real. This is always a personal tracking flag, never a
  // claim that anything changed — for `managed`, flipping it does NOT start or stop anything
  // real (Voice Calling keeps dialling either way; see cardBadge(), whose "Running" badge never
  // reads this flag), and for `planned` it shows as "Marked on" (violet), never the "Connected"
  // green a real integration gets. `pluginById` stays imported for that badge/copy logic even
  // though this function itself no longer blocks on readiness.
  const handleActivate = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: id, status: "active" }, { onConflict: "user_id,plugin_id" });
      if (error) throw error;
      const spec = pluginById(id);
      toast.success(spec?.readiness === "live" ? "Plugin enabled." : "Marked on — this is a personal flag, nothing else changed.");
      setActivateTarget(null);
      fetchPlugins();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // §D.3 — the fix for "Disable reports success having changed nothing." `.select("id")` lets
  // us see whether the UPDATE actually matched a row instead of assuming it did.
  const handleDeactivate = async (plugin: PluginSpec) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("user_plugins")
        .update({ status: "available" })
        .eq("user_id", user.id)
        .eq("plugin_id", plugin.id)
        .select("id");
      if (error) throw error;
      if (data && data.length > 0) {
        toast.success(plugin.readiness === "live" ? "Plugin disabled." : "Unmarked — this is a personal flag, nothing else changed.");
      } else {
        toast.info("This plugin wasn't marked on, so nothing changed.");
      }
      fetchPlugins();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // §D.1/§D.2 — validates required fields before saving (rather than accepting anything and
  // claiming success), and secret fields go through the plugin-secrets door (§E) instead of
  // ever being written into user_plugins.config.
  const handleSaveConfig = async (spec: PluginSpec, config: Record<string, string>, secretValues: Record<string, string>) => {
    if (!user) return;
    const knownSecretKeys = secretKeysFor(spec.id);
    const missing = missingRequiredFields(spec, config, knownSecretKeys);
    if (missing.length > 0) {
      toast.error(`Fill in required fields first: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    try {
      const nonSecretFields = visibleConfigFields(spec).filter((f) => !f.secret);
      const updatedNonSecretConfig = Object.fromEntries(nonSecretFields.map((f) => [f.key, (config[f.key] ?? "").trim()]));
      // Merge into the existing stored config rather than replacing it outright. Found by
      // self-review before this ever shipped: a plain replace would silently erase a legacy
      // plaintext value still sitting in a field this plugin's registry entry no longer writes
      // via `config` (n8n's own real, live `apiKey` — §0.9) the instant a user saved an
      // unrelated field like the webhook URL, without the user ever touching the secret field
      // or being warned. That plaintext value is only ever supposed to be removed by §E.5's own
      // explicit, later step 4 — never as a side effect of an unrelated save.
      const existingConfig = (dbPlugins.find((p) => p.plugin_id === spec.id)?.config as Record<string, string> | null) || {};
      const mergedConfig = { ...existingConfig, ...updatedNonSecretConfig };
      const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: spec.id, config: mergedConfig }, { onConflict: "user_id,plugin_id" });
      if (error) throw error;

      const secretFieldsToSave = spec.configFields.filter((f) => f.secret && secretValues[f.key]?.trim());
      for (const field of secretFieldsToSave) {
        const response = await supabase.functions.invoke("plugin-secrets", {
          body: { action: "set", plugin_id: spec.id, field_key: field.key, value: secretValues[field.key].trim() },
        });
        if (response.error) {
          throw new Error(await describeFunctionError(response.error, "Couldn't save that secret — secure storage may not be finished setting up on this account yet."));
        }
      }

      toast.success("Configuration saved.");
      setSetupTarget(null);
      fetchPlugins();
      fetchSecretMeta();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const enrichedPlugins = useMemo(
    () =>
      PLUGIN_REGISTRY.map((plugin) => {
        const dbPlugin = dbPlugins.find((entry) => entry.plugin_id === plugin.id);
        const config = (dbPlugin?.config as Record<string, string> | null) || {};
        const enabled = dbPlugin?.status === "active";
        const configured = isPluginConfigured(plugin, config, secretKeysFor(plugin.id));
        return { plugin, config, enabled, configured };
      }),
    [dbPlugins, secretKeysFor]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-foreground">Plugins</h1>
        <p className="text-sm text-muted-foreground mt-1">What's actually connected, what's already running behind the scenes, and what isn't built yet.</p>
      </div>

      {/* James, 2026-09-22: the section headers ("Connected"/"Running on the Callixis
          engine"/"Not available yet" + their subtitles) were removed as visual clutter — each
          card already carries the same information on its own badge (§A.1's honesty rule lives
          there, not in a page-level label), so the header text was redundant. GROUP_ORDER still
          controls the display ORDER (live, then managed, then planned) — only its title/subtitle
          text is unused now. */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">Manage your active integrations and add new VoIP, Email, Calendar, SMS, or WhatsApp channels.</p>
        <Button onClick={() => setAddIntegrationOpen(true)} className="gap-2 bg-primary text-primary-foreground">
          <Sparkles className="w-4 h-4" /> Add New Integration
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {GROUP_ORDER.flatMap((readiness) => enrichedPlugins.filter((e) => e.plugin.readiness === readiness)).map(
          ({ plugin, enabled, configured }) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              canManage={canManagePlugins}
              enabled={enabled}
              configured={configured}
              onActivate={setActivateTarget}
              onDeactivate={handleDeactivate}
              onSetup={setSetupTarget}
            />
          )
        )}
      </div>

      <ActivateDialog plugin={activateTarget} open={!!activateTarget} onOpenChange={(open) => !open && setActivateTarget(null)} onActivate={handleActivate} />
      <IntegrationSheet
        plugin={setupTarget}
        open={!!setupTarget}
        onOpenChange={(open) => !open && setSetupTarget(null)}
        onConfigSaved={handleSaveConfig}
        initialConfig={setupTarget ? (dbPlugins.find((p) => p.plugin_id === setupTarget.id)?.config as Record<string, string>) || {} : {}}
        configuredSecretKeys={secretKeysFor(setupTarget?.id || "")}
      />

      {/* Add New Integration Dialog */}
      <Dialog open={addIntegrationOpen} onOpenChange={setAddIntegrationOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Add New Integration</DialogTitle>
            <DialogDescription>
              {!selectedProvider
                ? "Step 1: Choose category and service provider."
                : "Step 2: Fill in required configuration fields."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!selectedProvider ? (
              <>
                <div>
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">1. Select Category</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[
                      { id: "voips", label: "VoIP" },
                      { id: "emails", label: "Emails" },
                      { id: "calendar", label: "Calendar" },
                      { id: "sms", label: "SMS" },
                      { id: "whatsapp", label: "WhatsApp" },
                    ].map((cat) => (
                      <Button
                        key={cat.id}
                        variant={selectedCategory === cat.id ? "default" : "outline"}
                        className="text-xs"
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setSelectedProvider(null);
                          setNewIntegrationFields({});
                        }}
                      >
                        {cat.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">2. Select Service Provider</Label>
                  <div className="grid grid-cols-1 gap-2 mt-1">
                    {(CATEGORY_PROVIDERS[selectedCategory] || []).map((prov) => (
                      <div
                        key={prov.id}
                        onClick={() => {
                          setSelectedProvider(prov);
                          setNewIntegrationFields({});
                        }}
                        className="p-3 border rounded-lg cursor-pointer hover:border-primary transition-all bg-card flex flex-col gap-1"
                      >
                        <div className="font-medium text-sm text-foreground">{prov.name}</div>
                        <div className="text-xs text-muted-foreground">{prov.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-secondary/50 p-3 rounded-lg">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase font-semibold">Selected Provider</div>
                    <div className="font-medium text-sm text-foreground">{selectedProvider.name}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedProvider(null)}>Change</Button>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Required Configuration Fields</Label>
                  {selectedProvider.fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs flex items-center justify-between">
                        <span>{field.label} {field.required && <span className="text-destructive">*</span>}</span>
                      </Label>
                      <Input
                        type={field.type === "password" ? "password" : "text"}
                        placeholder={field.placeholder}
                        value={newIntegrationFields[field.key] || ""}
                        onChange={(e) => setNewIntegrationFields({ ...newIntegrationFields, [field.key]: e.target.value })}
                      />
                      {field.help && <p className="text-[11px] text-muted-foreground">{field.help}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddIntegrationOpen(false); setSelectedProvider(null); }}>Cancel</Button>
            {selectedProvider && (
              <Button
                onClick={async () => {
                  // Validate mandatory fields
                  for (const field of selectedProvider.fields) {
                    if (field.required && !newIntegrationFields[field.key]?.trim()) {
                      toast.error(`Please fill in mandatory field: ${field.label}`);
                      return;
                    }
                  }
                  if (!user) return;
                  try {
                    const pluginId = `${selectedCategory}-${selectedProvider.id}`;
                    const { error } = await supabase.from("user_plugins").upsert({
                      user_id: user.id,
                      plugin_id: pluginId,
                      status: "active",
                      config: newIntegrationFields
                    }, { onConflict: "user_id,plugin_id" });
                    if (error) throw error;

                    toast.success(`Successfully connected ${selectedProvider.name}!`);
                    setAddIntegrationOpen(false);
                    setSelectedProvider(null);
                    setNewIntegrationFields({});
                    fetchPlugins();
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                Save & Connect
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Plugins;
