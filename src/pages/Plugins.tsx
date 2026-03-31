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
  {
    id: "fraud-shield",
    name: "IPQualityScore",
    description: "Real-time fraud and bot detection",
    longDescription: "Protect your campaigns from bot traffic, proxy users, and fraudulent lead submissions.",
    icon: Shield,
    status: "available",
    provider: "IPQS",
    priceMonthly: 199,
    priceYearly: 1990,
    features: ["Bot detection", "IP intelligence", "Email validation"],
    category: "Security",
    configFields: [
      { key: "apiKey", label: "IPQS API Key", placeholder: "Your API key", type: "password", required: true },
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

// ── Integration Setup Sheet ────────────────────────────
const IntegrationSheet = ({
  plugin, open, onOpenChange, onConfigSaved, initialConfig,
}: {
  plugin: Plugin | null; open: boolean; onOpenChange: (o: boolean) => void; onConfigSaved: (pluginId: string, config: any) => void; initialConfig?: any;
}) => {
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  useEffect(() => { if (plugin && open) setConfigValues(initialConfig || {}); }, [plugin, open, initialConfig]);
  if (!plugin) return null;
  const Icon = plugin.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md w-full bg-card border-border flex flex-col" side="right">
        <SheetHeader className="pb-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
            <div>
              <SheetTitle className="text-foreground">{plugin.name}</SheetTitle>
              <SheetDescription className="text-xs">Configure {plugin.provider} credentials</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-auto py-6 space-y-6">
          {plugin.configFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label className="text-foreground text-xs">{field.label}{field.required && "*"}</Label>
              <Input type={field.type} placeholder={field.placeholder} value={configValues[field.key] || ""} onChange={(e) => setConfigValues({...configValues, [field.key]: e.target.value})} className="bg-secondary border-border text-xs h-10" />
            </div>
          ))}
        </div>
        <div className="pt-6 border-t border-border">
          <Button onClick={() => onConfigSaved(plugin.id, configValues)} className="w-full gap-2 glow-cyan"><Check className="h-4 w-4" /> Save Configuration</Button>
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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Activate Plugin</DialogTitle>
        </DialogHeader>
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
    const { data } = await supabase.from("user_plugins").select("*").eq("user_id", user.id);
    if (data) setDbPlugins(data);
  }, [user]);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const handleActivate = async (id: string, cost: number) => {
    if (!user) return;
    const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: id, status: "active" }, { onConflict: "user_id,plugin_id" });
    if (!error) { toast.success("Plugin activated!"); setActivateTarget(null); fetchPlugins(); }
  };

  const handleDeactivate = async (plugin: Plugin) => {
    if (!user) return;
    const { error } = await supabase.from("user_plugins").update({ status: "available" }).eq("user_id", user.id).eq("plugin_id", plugin.id);
    if (!error) { toast.success("Plugin deactivated."); fetchPlugins(); }
  };

  const handleSaveConfig = async (id: string, config: any) => {
    if (!user) return;
    const { error } = await supabase.from("user_plugins").upsert({ user_id: user.id, plugin_id: id, config: config }, { onConflict: "user_id,plugin_id" });
    if (!error) { toast.success("Configuration saved!"); setSetupTarget(null); fetchPlugins(); }
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
