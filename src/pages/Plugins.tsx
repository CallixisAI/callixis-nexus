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
    description: "Connect complex background logic and workflows",
    longDescription: "The brain of your AI agents. Connect n8n webhooks to handle CRM updates, database logic, and multi-step integrations during AI interactions.",
    icon: Workflow,
    status: "available",
    provider: "n8n.io",
    priceMonthly: 49,
    priceYearly: 490,
    features: ["Background logic processing", "Webhooks integration", "CRM auto-sync", "Multi-platform connectivity"],
    category: "Automation",
    configFields: [
      { key: "webhookUrl", label: "Production Webhook URL", placeholder: "https://n8n.yourdomain.com/webhook/...", type: "url", required: true },
      { key: "apiKey", label: "n8n API Key (optional)", placeholder: "Your n8n API key", type: "password", required: false },
    ],
  },
  {
    id: "voip",
    name: "VoIP Pro",
    description: "SIP trunking and voice channels for AI agents",
    longDescription: "Enterprise-grade VoIP integration with SIP trunking, call recording, IVR, and real-time transcription.",
    icon: Phone,
    status: "available",
    provider: "Twilio",
    priceMonthly: 149,
    priceYearly: 1490,
    features: ["Unlimited SIP channels", "Call recording & transcription", "IVR builder", "Real-time analytics"],
    category: "Communication",
    configFields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text", required: true, helpUrl: "https://console.twilio.com" },
      { key: "authToken", label: "Auth Token", placeholder: "Your Twilio Auth Token", type: "password", required: true },
      { key: "phoneNumber", label: "Phone Number", placeholder: "+1234567890", type: "text", required: true },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "WhatsApp messaging automation",
    longDescription: "Official WhatsApp Business API with template messages, rich media, and chatbot flows.",
    icon: MessageCircle,
    status: "available",
    provider: "Meta",
    priceMonthly: 199,
    priceYearly: 1990,
    features: ["Template messages", "Rich media support", "Chatbot flows", "Conversation analytics"],
    category: "Communication",
    configFields: [
      { key: "apiToken", label: "WhatsApp API Token", placeholder: "Your Meta API Token", type: "password", required: true, helpUrl: "https://business.facebook.com" },
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890", type: "text", required: true },
    ],
  },
  {
    id: "crm-sync",
    name: "CRM Sync",
    description: "Two-way sync with Salesforce, HubSpot & more",
    longDescription: "Automatically sync leads, contacts, deals, and pipeline stages between Callixis and your CRM in real-time.",
    icon: RefreshCw,
    status: "available",
    provider: "Salesforce / HubSpot",
    priceMonthly: 199,
    priceYearly: 1990,
    features: ["Real-time bi-directional sync", "Custom field mapping", "Salesforce & HubSpot native"],
    category: "Integration",
    configFields: [
      { key: "crmProvider", label: "CRM Provider", placeholder: "Salesforce / HubSpot", type: "text", required: true },
      { key: "crmApiKey", label: "CRM API Key", type: "password", required: true },
      { key: "crmInstanceUrl", label: "CRM Instance URL", placeholder: "https://yourorg.salesforce.com", type: "url", required: true },
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
  plugin,
  open,
  onOpenChange,
  onConfigSaved,
  initialConfig,
}: {
  plugin: Plugin | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfigSaved: (pluginId: string, config: any) => void;
  initialConfig?: any;
}) => {
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (plugin && open) {
      setConfigValues(initialConfig || {});
    }
  }, [plugin, open, initialConfig]);

  if (!plugin) return null;
  const Icon = plugin.icon;

  const handleSaveConfig = () => {
    const missing = plugin.configFields.filter((f) => f.required && !configValues[f.key]?.trim());
    if (missing.length) {
      toast.error(`Please fill: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    onConfigSaved(plugin.id, configValues);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md w-full bg-card border-border flex flex-col" side="right">
        <SheetHeader className="pb-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-foreground">{plugin.name}</SheetTitle>
              <SheetDescription className="text-xs">Configure your {plugin.provider} credentials</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto py-6 space-y-6">
          {plugin.configFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-foreground text-xs">{field.label}{field.required && "*"}</Label>
              </div>
              <Input
                type={field.type}
                placeholder={field.placeholder}
                value={configValues[field.key] || ""}
                onChange={(e) => setConfigValues({...configValues, [field.key]: e.target.value})}
                className="bg-secondary border-border text-xs h-10"
              />
            </div>
          ))}
        </div>

        <div className="pt-6 border-t border-border">
          <Button onClick={handleSaveConfig} className="w-full gap-2 glow-cyan" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save Configuration
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ── Activation Dialog ──────────────────────────────────
const ActivateDialog = ({
  plugin, open, onOpenChange, balance, onActivate,
}: {
  plugin: Plugin | null; open: boolean; onOpenChange: (o: boolean) => void; balance: number; onActivate: (id: string, cost: number) => void;
}) => {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  if (!plugin) return null;
  const price = cycle === "monthly" ? plugin.priceMonthly : plugin.priceYearly;
  const Icon = plugin.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Activate Plugin</DialogTitle>
          <DialogDescription>Deducted from wallet balance.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 py-4">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
          <div><p className="text-sm font-bold text-foreground">{plugin.name}</p><p className="text-xs text-muted-foreground">{plugin.longDescription}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(["monthly", "yearly"] as const).map(c => (
            <button key={c} onClick={() => setCycle(c)} className={`rounded-lg border p-3 text-center transition-all ${cycle === c ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary"}`}>
              <p className="text-sm font-bold">{formatCurrency(c === "monthly" ? plugin.priceMonthly : plugin.priceYearly)}</p>
              <p className="text-[10px] uppercase opacity-60 font-bold">{c}</p>
            </button>
          ))}
        </div>
        <DialogFooter><Button onClick={() => onActivate(plugin.id, price)} className="w-full glow-cyan">Pay & Activate</Button></DialogFooter>
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
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="h-6 w-6 text-primary" />
          </div>
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
                {isAdmin && (
                  <Button variant="outline" size="sm" className="h-8 text-xs border-border bg-secondary/50" onClick={() => onSetup(plugin)}>
                    <Settings className="h-3 w-3 mr-1" /> Config
                  </Button>
                )}
                {isAdmin && (isActive ? (
                  <Button variant="outline" size="sm" className="h-8 text-xs border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => onDeactivate(plugin)}>Off</Button>
                ) : (
                  <Button size="sm" className="h-8 text-xs glow-cyan" onClick={() => onActivate(plugin)}>Activate</Button>
                ))}
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
  const [loading, setLoading] = useState(true);
  const [dbPlugins, setDbPlugins] = useState<any[]>([]);
  const [activateTarget, setActivateTarget] = useState<Plugin | null>(null);
  const [setupTarget, setSetupTarget] = useState<Plugin | null>(null);

  const fetchPlugins = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("user_plugins").select("*").eq("user_id", user.id);
    if (data) setDbPlugins(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const handleActivate = async (id: string, cost: number) => {
    if (!user) return;
    const { error } = await supabase.from("user_plugins").upsert({
      user_id: user.id,
      plugin_id: id,
      status: "active"
    }, { onConflict: "user_id,plugin_id" });

    if (!error) {
      toast.success("Plugin activated!");
      setActivateTarget(null);
      fetchPlugins();
    }
  };

  const handleDeactivate = async (plugin: Plugin) => {
    if (!user) return;
    const { error } = await supabase.from("user_plugins").update({ status: "available" }).eq("user_id", user.id).eq("plugin_id", plugin.id);
    if (!error) {
      toast.success("Plugin turned off.");
      fetchPlugins();
    }
  };

  const handleSaveConfig = async (id: string, config: any) => {
    if (!user) return;
    const { error } = await supabase.from("user_plugins").upsert({
      user_id: user.id,
      plugin_id: id,
      config: config
    }, { onConflict: "user_id,plugin_id" });

    if (!error) {
      toast.success("Configuration saved!");
      setSetupTarget(null);
      fetchPlugins();
    }
  };

  const enrichedPlugins = pluginRegistry.map(p => {
    const dbP = dbPlugins.find(dp => dp.plugin_id === p.id);
    return {
      ...p,
      status: (dbP?.status || "available") as PluginStatus,
      isConfigured: !!dbP?.config && Object.keys(dbP.config).length > 0,
      config: dbP?.config || {}
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-foreground">Plugins Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">Scale your AI with pro-grade integrations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
        {enrichedPlugins.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            isAdmin={isAdmin}
            isConfigured={plugin.isConfigured}
            onActivate={setActivateTarget}
            onDeactivate={handleDeactivate}
            onSetup={setSetupTarget}
          />
        ))}
      </div>

      <ActivateDialog plugin={activateTarget} open={!!activateTarget}
        onOpenChange={(o) => !o && setActivateTarget(null)} balance={WALLET_BALANCE} onActivate={handleActivate} />
      
      <IntegrationSheet 
        plugin={setupTarget} 
        open={!!setupTarget}
        initialConfig={enrichedPlugins.find(p => p.id === setupTarget?.id)?.config}
        onOpenChange={(o) => !o && setSetupTarget(null)} 
        onConfigSaved={handleSaveConfig} 
      />
    </div>
  );
};

export default Plugins;
