import { useState, useRef, useEffect, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Phone,
  Mail,
  Check,
  Settings,
  Send,
  Sparkles,
  AlertCircle,
  Workflow,
  CreditCard,
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
import type { Database } from "@/integrations/supabase/types";

type PluginRow = Database["public"]["Tables"]["user_plugins"]["Row"];
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type PluginStatus = "active" | "available" | "inactive";

interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password" | "url";
  required: boolean;
}

interface Plugin {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  icon: LucideIcon;
  status: PluginStatus;
  provider: string;
  features: string[];
  category: string;
  configFields: ConfigField[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const pluginRegistry: Plugin[] = [
  {
    id: "n8n",
    name: "n8n Automation",
    description: "Connect workflow automation and webhook orchestration.",
    longDescription: "Use n8n as the workflow brain for the Chat Test and script generator. Point this at your workflow's /chat webhook door specifically — not the /vapi-events or /transcript doors, which are for call outcomes, not chat replies.",
    icon: Workflow,
    status: "available",
    provider: "n8n.io",
    features: ["Workflow orchestration", "Webhook integration", "CRM sync"],
    category: "Automation",
    configFields: [
      { key: "webhookUrl", label: "Chat Webhook URL", placeholder: "https://n8n.yourdomain.com/webhook/chat", type: "url", required: true },
      { key: "apiKey", label: "n8n API Key", placeholder: "Your n8n API key", type: "password", required: false },
    ],
  },
  {
    id: "twilio",
    name: "Twilio SMS & Voice",
    description: "Store SMS and voice credentials for future telephony wiring.",
    longDescription: "This records Twilio credentials in the plugin config table. It does not create live telephony yet.",
    icon: Phone,
    status: "available",
    provider: "Twilio",
    features: ["SMS credentials", "Voice credentials", "Phone number storage"],
    category: "Communication",
    configFields: [
      { key: "accountSid", label: "Account SID", placeholder: "AC...", type: "text", required: true },
      { key: "authToken", label: "Auth Token", placeholder: "Your Twilio token", type: "password", required: true },
      { key: "phoneNumber", label: "Twilio Phone Number", placeholder: "+1...", type: "text", required: true },
    ],
  },
  {
    id: "stripe",
    name: "Stripe Payments",
    description: "Store payment-provider keys for future payment workflows.",
    longDescription: "This stores Stripe credentials in configuration. It does not process live payments yet.",
    icon: CreditCard,
    status: "available",
    provider: "Stripe",
    features: ["API key storage", "Payment provider setup", "Future checkout wiring"],
    category: "Finance",
    configFields: [
      { key: "publishableKey", label: "Publishable Key", placeholder: "pk_test...", type: "text", required: true },
      { key: "secretKey", label: "Secret Key", placeholder: "sk_test...", type: "password", required: true },
    ],
  },
  {
    id: "sendgrid",
    name: "SendGrid Email",
    description: "Store email delivery credentials for future messaging flows.",
    longDescription: "This stores SendGrid configuration in the database for later email automation work.",
    icon: Mail,
    status: "available",
    provider: "Twilio SendGrid",
    features: ["API key storage", "Sender identity", "Future email automation"],
    category: "Communication",
    configFields: [
      { key: "apiKey", label: "SendGrid API Key", placeholder: "SG...", type: "password", required: true },
      { key: "senderEmail", label: "Verified Sender Email", placeholder: "hello@yourdomain.com", type: "text", required: true },
    ],
  },
];

const statusStyles: Record<PluginStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  available: "bg-secondary text-muted-foreground border-border",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
};

async function streamChat({ messages, pluginId, onDelta, onDone, onError }: {
  messages: ChatMessage[];
  pluginId: string;
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  try {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plugin-setup-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify({ messages, pluginId }),
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
}: {
  plugin: Plugin | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfigSaved: (pluginId: string, config: Record<string, string>) => void;
  initialConfig?: Record<string, string>;
}) => {
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (plugin && open) {
      setConfigValues(initialConfig || {});
      setMessages([{ role: "assistant", content: `I can help explain the ${plugin.name} fields, but saving configuration is the only guaranteed working action here.` }]);
    }
  }, [plugin, open, initialConfig]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!plugin) return null;
  const Icon = plugin.icon;

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
            <SheetDescription>Save credentials and notes for this integration</SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border p-6 overflow-auto space-y-6">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration</h3>
              <p className="text-xs text-muted-foreground mt-1">These values are stored in `user_plugins.config`. They do not automatically activate the underlying provider.</p>
            </div>
            {plugin.configFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label className="text-xs">{field.label}{field.required && " *"}</Label>
                <Input type={field.type} value={configValues[field.key] || ""} onChange={(event) => setConfigValues({ ...configValues, [field.key]: event.target.value })} className="bg-secondary" />
              </div>
            ))}
            <Button onClick={() => onConfigSaved(plugin.id, configValues)} className="w-full glow-cyan">Save Settings</Button>
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
  plugin: Plugin | null;
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
          <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" /> Activate Plugin</DialogTitle>
          <DialogDescription>Activation marks the integration as enabled in the database. It does not validate credentials or provision the provider.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 py-4">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
          <div>
            <p className="text-sm font-bold text-foreground">{plugin.name}</p>
            <p className="text-xs text-muted-foreground">{plugin.description}</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onActivate(plugin.id)} className="w-full glow-cyan">Mark Active</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PluginCard = ({
  plugin,
  isConfigured,
  onActivate,
  onDeactivate,
  onSetup,
  canManage,
}: {
  plugin: Plugin;
  isConfigured: boolean;
  onActivate: (p: Plugin) => void;
  onDeactivate: (p: Plugin) => void;
  onSetup: (p: Plugin) => void;
  // Phase 2 §E/[E24]: was `isAdmin`. Gated on the `plugins` permission now, not the admin
  // role — see the Plugins() component below for why.
  canManage: boolean;
}) => {
  const Icon = plugin.icon;
  const isActive = plugin.status === "active";

  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all group">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Icon className="h-6 w-6 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground truncate">{plugin.name}</h3>
              <Badge variant="outline" className={`text-[10px] uppercase font-bold ${statusStyles[plugin.status]}`}>{plugin.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plugin.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {plugin.features.map((feature) => (
                <span key={feature} className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground">{feature}</span>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isConfigured ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                {isConfigured ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {isConfigured ? "Config Saved" : "Needs Config"}
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Provider: <span className="text-foreground">{plugin.provider}</span></p>
              <div className="flex gap-2">
                {canManage && <Button variant="outline" size="sm" className="h-8 text-xs border-border bg-secondary/50" onClick={() => onSetup(plugin)}><Settings className="h-3 w-3 mr-1" /> Config</Button>}
                {canManage && (isActive ? <Button variant="outline" size="sm" className="h-8 text-xs border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => onDeactivate(plugin)}>Disable</Button> : <Button size="sm" className="h-8 text-xs glow-cyan" onClick={() => onActivate(plugin)}>Enable</Button>)}
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
  const [activateTarget, setActivateTarget] = useState<Plugin | null>(null);
  const [setupTarget, setSetupTarget] = useState<Plugin | null>(null);

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

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const handleActivate = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: id, status: "active" }, { onConflict: "user_id,plugin_id" });
      if (error) throw error;
      toast.success("Plugin marked active.");
      setActivateTarget(null);
      fetchPlugins();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleDeactivate = async (plugin: Plugin) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_plugins").update({ status: "available" }).eq("user_id", user.id).eq("plugin_id", plugin.id);
      if (error) throw error;
      toast.success("Plugin disabled.");
      fetchPlugins();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleSaveConfig = async (id: string, config: Record<string, string>) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: id, config }, { onConflict: "user_id,plugin_id" });
      if (error) throw error;
      toast.success("Configuration saved.");
      setSetupTarget(null);
      fetchPlugins();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const enrichedPlugins = pluginRegistry.map((plugin) => {
    const dbPlugin = dbPlugins.find((entry) => entry.plugin_id === plugin.id);
    const config = (dbPlugin?.config as Record<string, string> | null) || {};
    return {
      ...plugin,
      status: (dbPlugin?.status || "available") as PluginStatus,
      isConfigured: Object.keys(config).length > 0,
      config,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-foreground">Plugins</h1>
        <p className="text-sm text-muted-foreground mt-1">Real integration state stored in the `user_plugins` table.</p>
      </div>

      <Card className="bg-card border-border p-4 text-xs text-muted-foreground leading-relaxed">
        This page is now intentionally plainspoken. Enabling a plugin updates database state. Saving config stores credentials or settings in `user_plugins.config`. Neither action guarantees the external provider is live until the corresponding backend flow is wired.
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {enrichedPlugins.map((plugin) => (
          <PluginCard key={plugin.id} plugin={plugin} canManage={canManagePlugins} isConfigured={plugin.isConfigured} onActivate={setActivateTarget} onDeactivate={handleDeactivate} onSetup={setSetupTarget} />
        ))}
      </div>

      <ActivateDialog plugin={activateTarget} open={!!activateTarget} onOpenChange={(open) => !open && setActivateTarget(null)} onActivate={handleActivate} />
      <IntegrationSheet plugin={setupTarget} open={!!setupTarget} initialConfig={enrichedPlugins.find((plugin) => plugin.id === setupTarget?.id)?.config} onOpenChange={(open) => !open && setSetupTarget(null)} onConfigSaved={handleSaveConfig} />
    </div>
  );
};

export default Plugins;
