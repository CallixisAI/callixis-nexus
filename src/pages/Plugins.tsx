import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Phone,
  MessageSquare,
  Mail,
  MessageCircle,
  Check,
  Plus,
  Wallet,
  Zap,
  Shield,
  BarChart3,
  Globe,
  Bot,
  Settings,
  Send,
  Loader2,
  Sparkles,
  ExternalLink,
  AlertCircle,
  LinkIcon,
  Unlink,
  RefreshCw,
  CalendarCheck,
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
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── types ──────────────────────────────────────────────
type PluginStatus = "active" | "available" | "inactive";
type BillingCycle = "monthly" | "yearly";

interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password" | "url";
  required: boolean;
  helpUrl?: string;
}

interface Plugin {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  icon: any;
  status: PluginStatus;
  provider: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  category: string;
  configFields: ConfigField[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── plugin definitions ─────────────────────────────────
const pluginRegistry: Plugin[] = [
  {
    id: "n8n",
    name: "n8n Automation",
    description: "Complex background logic and custom workflows",
    longDescription: "The brain of your AI agents. Connect n8n webhooks to handle CRM updates, database logic, and multi-step integrations.",
    icon: Workflow,
    status: "available",
    provider: "n8n.io",
    priceMonthly: 49,
    priceYearly: 490,
    features: ["Background logic processing", "Webhooks integration", "CRM auto-sync"],
    category: "Automation",
    configFields: [
      { key: "webhookUrl", label: "Production Webhook URL", placeholder: "https://n8n.yourdomain.com/webhook/...", type: "url", required: true },
      { key: "apiKey", label: "n8n API Key", placeholder: "Your n8n API key", type: "password", required: false },
    ],
  },
  {
    id: "twilio",
    name: "Twilio SMS & Voice",
    description: "Enterprise SMS and SIP trunking for AI agents",
    longDescription: "High-throughput SMS gateway and global VoIP channels for AI-driven calling campaigns.",
    icon: Phone,
    status: "available",
    provider: "Twilio",
    priceMonthly: 149,
    priceYearly: 1490,
    features: ["Global SMS sending", "SIP trunking", "IVR capabilities"],
    category: "Communication",
    configFields: [
      { key: "accountSid", label: "Account SID", placeholder: "AC...", type: "text", required: true },
      { key: "authToken", label: "Auth Token", placeholder: "Your Twilio Token", type: "password", required: true },
      { key: "phoneNumber", label: "Twilio Phone Number", placeholder: "+1...", type: "text", required: true },
    ],
  },
  {
    id: "stripe",
    name: "Stripe Payments",
    description: "Accept payments during AI calls and chats",
    longDescription: "Secure payment processing integration. Allow your AI agents to send payment links or process transactions safely.",
    icon: CreditCard,
    status: "available",
    provider: "Stripe",
    priceMonthly: 129,
    priceYearly: 1290,
    features: ["Payment link generation", "Transaction tracking", "SCA compliance"],
    category: "Finance",
    configFields: [
      { key: "publishableKey", label: "Publishable Key", placeholder: "pk_test...", type: "text", required: true },
      { key: "secretKey", label: "Secret Key", placeholder: "sk_test...", type: "password", required: true },
    ],
  },
  {
    id: "sendgrid",
    name: "SendGrid Email",
    description: "Automated email sequences and notifications",
    longDescription: "Scalable email delivery for follow-ups, newsletters, and lead nurturing campaigns.",
    icon: Mail,
    status: "available",
    provider: "Twilio SendGrid",
    priceMonthly: 79,
    priceYearly: 790,
    features: ["Transactional email", "Marketing sequences", "Dynamic templates"],
    category: "Communication",
    configFields: [
      { key: "apiKey", label: "SendGrid API Key", placeholder: "SG...", type: "password", required: true },
      { key: "senderEmail", label: "Verified Sender Email", placeholder: "hello@yourdomain.com", type: "text", required: true },
    ],
  },
];

const WALLET_BALANCE = 8350;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const statusStyles: Record<PluginStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  available: "bg-secondary text-muted-foreground border-border",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
};

// ── AI Chat stream helper ──────────────────────────────
async function streamChat({ messages, pluginId, onDelta, onDone, onError }: any) {
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
      // Fixed line splitting to be building safe
      const lines = chunk.split("
").filter(l => l.trim().startsWith("data: "));
      for (const line of lines) {
        const data = line.replace("data: ", "").trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {}
      }
    }
    onDone();
  } catch { onError("Error connecting to assistant."); }
}

// ── Integration Setup Sheet ────────────────────────────
const IntegrationSheet = ({
  plugin, open, onOpenChange, onConfigSaved, initialConfig,
}: {
  plugin: Plugin | null; open: boolean; onOpenChange: (o: boolean) => void; onConfigSaved: (pluginId: string, config: any) => void; initialConfig?: any;
}) => {
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (plugin && open) {
      setConfigValues(initialConfig || {});
      setMessages([{ role: "assistant", content: `👋 Hi! I'm your **${plugin.name}** assistant. Do you have your credentials ready?` }]);
    }
  }, [plugin, open, initialConfig]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

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
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > newMsgs.length) {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      },
      onDone: () => setIsStreaming(false),
      onError: (msg: string) => { toast.error(msg); setIsStreaming(false); }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-4xl w-full bg-card border-border flex flex-col p-0" side="right">
        <SheetHeader className="p-6 border-b border-border shrink-0 flex flex-row items-center gap-4">
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
          <div><SheetTitle>{plugin.name}</SheetTitle><SheetDescription>Configure and get AI help</SheetDescription></div>
        </SheetHeader>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border p-6 overflow-auto space-y-6">
            <h3 className="text-sm font-bold flex items-center gap-2"><Settings className="h-4 w-4" /> Configuration</h3>
            {plugin.configFields.map(f => (
              <div key={f.key} className="space-y-2">
                <Label className="text-xs">{f.label}{f.required && "*"}</Label>
                <Input type={f.type} value={configValues[f.key] || ""} onChange={e => setConfigValues({...configValues, [f.key]: e.target.value})} className="bg-secondary" />
              </div>
            ))}
            <Button onClick={() => onConfigSaved(plugin.id, configValues)} className="w-full glow-cyan">Save Settings</Button>
          </div>
          <div className="w-1/2 flex flex-col bg-secondary/20">
            <div className="p-3 border-b border-border text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><Sparkles className="h-3 w-3 text-primary" /> AI Assistant</div>
            <ScrollArea className="flex-1 p-4"><div ref={scrollRef} className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-2 rounded text-xs ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>{m.content}</div>
                </div>
              ))}
            </div></ScrollArea>
            <div className="p-4 border-t border-border flex gap-2">
              <Input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask for help..." onKeyDown={e => e.key === 'Enter' && handleChatSend()} className="h-9 text-xs" />
              <Button onClick={handleChatSend} size="icon" className="h-9 w-9 shrink-0"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ── Activation Dialog ──────────────────────────────────
const ActivateDialog = ({
  plugin, open, onOpenChange, onActivate,
}: {
  plugin: Plugin | null; open: boolean; onOpenChange: (o: boolean) => void; onActivate: (id: string, cost: number) => void;
}) => {
  if (!plugin) return null;
  const Icon = plugin.icon;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Activate Plugin</DialogTitle></DialogHeader>
        <div className="flex items-start gap-3 py-4">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
          <div><p className="text-sm font-bold text-foreground">{plugin.name}</p><p className="text-xs text-muted-foreground">{plugin.description}</p></div>
        </div>
        <DialogFooter><Button onClick={() => onActivate(plugin.id, plugin.priceMonthly)} className="w-full glow-cyan">Activate for {formatCurrency(plugin.priceMonthly)}/mo</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Plugin Card ────────────────────────────────────────
const PluginCard = ({
  plugin, isConfigured, onActivate, onDeactivate, onSetup, isAdmin,
}: {
  plugin: Plugin; isConfigured: boolean; onActivate: (p: Plugin) => void; onDeactivate: (p: Plugin) => void; onSetup: (p: Plugin) => void; isAdmin: boolean;
}) => {
  const Icon = plugin.icon;
  const isActive = plugin.status === "active";
  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all group">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Icon className="h-6 w-6 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground truncate">{plugin.name}</h3>
              <Badge variant="outline" className={`text-[10px] uppercase font-bold ${statusStyles[plugin.status]}`}>{plugin.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plugin.description}</p>
            <div className="mt-4 flex items-center gap-2">
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isConfigured ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                {isConfigured ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />} {isConfigured ? "Linked" : "Required"}
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm font-bold font-mono text-primary">{formatCurrency(plugin.priceMonthly)}<span className="text-[10px] text-muted-foreground">/mo</span></p>
              <div className="flex gap-2">
                {isAdmin && <Button variant="outline" size="sm" className="h-8 text-xs border-border bg-secondary/50" onClick={() => onSetup(plugin)}><Settings className="h-3 w-3 mr-1" /> Config</Button>}
                {isAdmin && (isActive ? <Button variant="outline" size="sm" className="h-8 text-xs border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => onDeactivate(plugin)}>Off</Button> : <Button size="sm" className="h-8 text-xs glow-cyan" onClick={() => onActivate(plugin)}>Activate</Button>)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Main Page ──────────────────────────────────────────
const Plugins = () => {
  const { role, user } = useAuth();
  const isAdmin = role?.toLowerCase() === "admin";
  const [dbPlugins, setDbPlugins] = useState<any[]>([]);
  const [activateTarget, setActivateTarget] = useState<Plugin | null>(null);
  const [setupTarget, setSetupTarget] = useState<Plugin | null>(null);

  const fetchPlugins = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("user_plugins").select("*").eq("user_id", user.id);
      if (!error && data) setDbPlugins(data);
    } catch (err) { console.error(err); }
  }, [user]);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const handleActivate = async (id: string, cost: number) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: id, status: "active" }, { onConflict: "user_id,plugin_id" });
      if (error) throw error;
      toast.success("Plugin activated!"); setActivateTarget(null); fetchPlugins();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeactivate = async (plugin: Plugin) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_plugins").update({ status: "available" }).eq("user_id", user.id).eq("plugin_id", plugin.id);
      if (error) throw error;
      toast.success("Plugin deactivated."); fetchPlugins();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSaveConfig = async (id: string, config: any) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: id, config: config }, { onConflict: "user_id,plugin_id" });
      if (error) throw error;
      toast.success("Configuration saved!"); setSetupTarget(null); fetchPlugins();
    } catch (err: any) { toast.error(err.message); }
  };

  const enrichedPlugins = pluginRegistry.map(p => {
    const dbP = dbPlugins.find(dp => dp.plugin_id === p.id);
    return { ...p, status: (dbP?.status || "available") as PluginStatus, isConfigured: !!dbP?.config && Object.keys(dbP.config).length > 0, config: dbP?.config || {} };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div><h1 className="text-2xl font-display text-foreground">Plugins Marketplace</h1><p className="text-sm text-muted-foreground mt-1">Scale your AI with pro-grade integrations.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {enrichedPlugins.map((plugin) => (
          <PluginCard key={plugin.id} plugin={plugin} isAdmin={isAdmin} isConfigured={plugin.isConfigured} onActivate={setActivateTarget} onDeactivate={handleDeactivate} onSetup={setSetupTarget} />
        ))}
      </div>
      <ActivateDialog plugin={activateTarget} open={!!activateTarget} onOpenChange={(o) => !o && setActivateTarget(null)} onActivate={handleActivate} />
      <IntegrationSheet plugin={setupTarget} open={!!setupTarget} initialConfig={enrichedPlugins.find(p => p.id === setupTarget?.id)?.config} onOpenChange={(o) => !o && setSetupTarget(null)} onConfigSaved={handleSaveConfig} />
    </div>
  );
};

export default Plugins;
