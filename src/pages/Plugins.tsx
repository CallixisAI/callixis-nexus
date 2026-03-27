import { useState, useRef, useEffect } from "react";
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
  icon: typeof Phone;
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

// ── mock data ──────────────────────────────────────────
const WALLET_BALANCE = 8350;

const plugins: Plugin[] = [
  {
    id: "voip",
    name: "VoIP Pro",
    description: "SIP trunking and voice channels for AI agents",
    longDescription: "Enterprise-grade VoIP integration with SIP trunking, call recording, IVR, and real-time transcription.",
    icon: Phone,
    status: "active",
    provider: "Twilio",
    priceMonthly: 149,
    priceYearly: 1490,
    features: ["Unlimited SIP channels", "Call recording & transcription", "IVR builder", "Real-time analytics"],
    category: "Communication",
    configFields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text", required: true, helpUrl: "https://console.twilio.com" },
      { key: "authToken", label: "Auth Token", placeholder: "Your Twilio Auth Token", type: "password", required: true },
      { key: "phoneNumber", label: "Phone Number", placeholder: "+1234567890", type: "text", required: true },
      { key: "sipDomain", label: "SIP Domain (optional)", placeholder: "your-domain.sip.twilio.com", type: "text", required: false },
    ],
  },
  {
    id: "sms",
    name: "SMS Gateway",
    description: "Bulk SMS and automated texting campaigns",
    longDescription: "High-throughput SMS gateway with automated sequences, A/B testing, and delivery analytics.",
    icon: MessageSquare,
    status: "active",
    provider: "Twilio",
    priceMonthly: 99,
    priceYearly: 990,
    features: ["Bulk sending (10k+/hr)", "Automated sequences", "A/B testing", "Delivery tracking"],
    category: "Communication",
    configFields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text", required: true, helpUrl: "https://console.twilio.com" },
      { key: "authToken", label: "Auth Token", placeholder: "Your Twilio Auth Token", type: "password", required: true },
      { key: "phoneNumber", label: "SMS Phone Number", placeholder: "+1234567890", type: "text", required: true },
      { key: "messagingServiceSid", label: "Messaging Service SID (optional)", placeholder: "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text", required: false },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "WhatsApp messaging automation",
    longDescription: "Official WhatsApp Business API with template messages, rich media, and chatbot flows.",
    icon: MessageCircle,
    status: "active",
    provider: "Meta",
    priceMonthly: 199,
    priceYearly: 1990,
    features: ["Template messages", "Rich media support", "Chatbot flows", "Conversation analytics"],
    category: "Communication",
    configFields: [
      { key: "apiToken", label: "WhatsApp API Token", placeholder: "Your Meta API Token", type: "password", required: true, helpUrl: "https://business.facebook.com" },
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890", type: "text", required: true },
      { key: "businessId", label: "Business Account ID", placeholder: "9876543210", type: "text", required: true },
      { key: "webhookSecret", label: "Webhook Verify Token", placeholder: "Your webhook secret", type: "password", required: false },
    ],
  },
  {
    id: "email",
    name: "Email Campaigns",
    description: "Automated email sequences and drip campaigns",
    longDescription: "Full-featured email marketing with drag-and-drop builder and automation workflows.",
    icon: Mail,
    status: "available",
    provider: "SendGrid",
    priceMonthly: 79,
    priceYearly: 790,
    features: ["Drag-and-drop builder", "Automation workflows", "Audience segmentation", "Engagement metrics"],
    category: "Communication",
    configFields: [
      { key: "apiKey", label: "SendGrid API Key", placeholder: "SG.xxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://app.sendgrid.com/settings/api_keys" },
      { key: "senderEmail", label: "Verified Sender Email", placeholder: "noreply@yourdomain.com", type: "text", required: true },
      { key: "senderName", label: "Sender Name", placeholder: "Your Company", type: "text", required: true },
    ],
  },
  {
    id: "crm-sync",
    name: "CRM Sync",
    description: "Two-way sync with Salesforce, HubSpot & more",
    longDescription: "Automatically sync leads, contacts, deals, and pipeline stages between Callixis and your CRM in real-time. Supports Salesforce, HubSpot, Zoho, and custom CRMs via REST API.",
    icon: RefreshCw,
    status: "available",
    provider: "Salesforce / HubSpot",
    priceMonthly: 199,
    priceYearly: 1990,
    features: ["Real-time bi-directional sync", "Custom field mapping", "Salesforce & HubSpot native", "Webhook-based updates"],
    category: "Integration",
    configFields: [
      { key: "crmProvider", label: "CRM Provider", placeholder: "Salesforce / HubSpot / Zoho / Custom", type: "text", required: true },
      { key: "crmApiKey", label: "CRM API Key / Access Token", placeholder: "Your CRM API key or OAuth token", type: "password", required: true },
      { key: "crmInstanceUrl", label: "CRM Instance URL", placeholder: "https://yourorg.my.salesforce.com", type: "url", required: true },
      { key: "syncInterval", label: "Sync Interval (minutes)", placeholder: "5", type: "text", required: false },
    ],
  },
  {
    id: "lead-scoring",
    name: "AI Lead Scoring",
    description: "Intelligent lead qualification and scoring",
    longDescription: "ML-powered lead scoring that analyzes behavior and engagement to prioritize prospects.",
    icon: BarChart3,
    status: "available",
    provider: "Callixis AI",
    priceMonthly: 249,
    priceYearly: 2490,
    features: ["ML-powered scoring", "Behavioral analysis", "Custom scoring rules", "CRM sync"],
    category: "Intelligence",
    configFields: [
      { key: "crmType", label: "CRM Platform", placeholder: "Salesforce / HubSpot / Custom", type: "text", required: true },
      { key: "crmApiKey", label: "CRM API Key", placeholder: "Your CRM API key", type: "password", required: true },
      { key: "crmEndpoint", label: "CRM Endpoint URL", placeholder: "https://api.yourcrm.com", type: "url", required: false },
    ],
  },
  {
    id: "fraud-shield",
    name: "Fraud Shield",
    description: "Real-time fraud detection for lead traffic",
    longDescription: "Protect campaigns from fraudulent leads with bot detection and compliance validation.",
    icon: Shield,
    status: "available",
    provider: "Callixis",
    priceMonthly: 129,
    priceYearly: 1290,
    features: ["Bot detection", "IP intelligence", "Duplicate filtering", "Compliance checks"],
    category: "Security",
    configFields: [
      { key: "sensitivity", label: "Detection Sensitivity", placeholder: "low / medium / high", type: "text", required: true },
      { key: "ipProviderKey", label: "IP Intelligence API Key (optional)", placeholder: "MaxMind or IPQualityScore key", type: "password", required: false },
    ],
  },
  {
    id: "multi-language",
    name: "Multi-Language AI",
    description: "AI agents in 30+ languages",
    longDescription: "Expand reach with AI agents that speak 30+ languages with auto-detection.",
    icon: Globe,
    status: "available",
    provider: "Callixis AI",
    priceMonthly: 179,
    priceYearly: 1790,
    features: ["30+ languages", "Auto-detection", "Cultural adaptation", "Voice synthesis"],
    category: "Intelligence",
    configFields: [
      { key: "primaryLanguage", label: "Primary Language", placeholder: "English", type: "text", required: true },
      { key: "targetLanguages", label: "Target Languages (comma-separated)", placeholder: "Spanish, French, German", type: "text", required: true },
    ],
  },
  {
    id: "chatbot",
    name: "Web Chatbot",
    description: "Embeddable AI chatbot for websites",
    longDescription: "Deploy a customizable AI chatbot to capture leads 24/7 with smart qualification.",
    icon: Bot,
    status: "available",
    provider: "Callixis AI",
    priceMonthly: 159,
    priceYearly: 1590,
    features: ["Embeddable widget", "Lead qualification", "Appointment booking", "Custom branding"],
    category: "Automation",
    configFields: [
      { key: "websiteUrl", label: "Website URL", placeholder: "https://yourwebsite.com", type: "url", required: true },
      { key: "brandColor", label: "Brand Color (hex)", placeholder: "#00E5A0", type: "text", required: false },
      { key: "greetingMessage", label: "Greeting Message", placeholder: "Hi! How can I help you today?", type: "text", required: true },
    ],
  },
  {
    id: "calendar",
    name: "Calendar & Scheduling",
    description: "Let leads book appointments during AI calls & chats",
    longDescription: "Integrate with Calendly, Google Calendar, or Outlook to let AI agents schedule meetings in real-time during calls. Supports round-robin assignment, buffer times, and automatic reminders.",
    icon: CalendarCheck,
    status: "available",
    provider: "Calendly / Google",
    priceMonthly: 89,
    priceYearly: 890,
    features: ["Real-time booking during calls", "Calendly & Google Calendar sync", "Round-robin agent assignment", "Automatic reminders & follow-ups"],
    category: "Automation",
    configFields: [
      { key: "calendarProvider", label: "Calendar Provider", placeholder: "Calendly / Google Calendar / Outlook", type: "text", required: true },
      { key: "apiKey", label: "API Key / Access Token", placeholder: "Your calendar API key", type: "password", required: true, helpUrl: "https://developer.calendly.com" },
      { key: "eventTypeUrl", label: "Default Event/Booking URL", placeholder: "https://calendly.com/your-org/30min", type: "url", required: true },
      { key: "timezone", label: "Default Timezone", placeholder: "America/New_York", type: "text", required: false },
    ],
  },
];

// ── helpers ────────────────────────────────────────────
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const statusStyles: Record<PluginStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  available: "bg-secondary text-muted-foreground border-border",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
};

// ── AI Chat stream helper ──────────────────────────────
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plugin-setup-chat`;

async function streamChat({
  messages,
  pluginId,
  onDelta,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  pluginId: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, pluginId }),
    });

    if (resp.status === 429) {
      onError("Rate limited. Please wait a moment and try again.");
      return;
    }
    if (resp.status === 402) {
      onError("AI credits exhausted. Please add funds in Settings > Workspace > Usage.");
      return;
    }
    if (!resp.ok || !resp.body) {
      onError("Failed to connect to AI assistant.");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  } catch {
    onError("Network error. Please try again.");
  }
}

// ── Integration Setup Sheet ────────────────────────────
const IntegrationSheet = ({
  plugin,
  open,
  onOpenChange,
  onConfigSaved,
}: {
  plugin: Plugin | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfigSaved: (pluginId: string) => void;
}) => {
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when plugin changes
  useEffect(() => {
    if (plugin && open) {
      setConfigValues({});
      setMessages([]);
      setChatInput("");
      setIsStreaming(false);
      // Send initial greeting
      const greeting: ChatMessage = {
        role: "assistant",
        content: `👋 Hi! I'm your Callixis setup assistant for **${plugin.name}**. I'll guide you through the integration step by step.\n\nLet's get started — do you already have your ${plugin.provider} credentials, or do you need help getting them?`,
      };
      setMessages([greeting]);
    }
  }, [plugin?.id, open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!plugin) return null;

  const Icon = plugin.icon;

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatInput("");
    setIsStreaming(true);

    let assistantSoFar = "";

    await streamChat({
      messages: newMessages.filter((m) => m.role === "user" || m.role === "assistant"),
      pluginId: plugin.id,
      onDelta: (chunk) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > newMessages.length) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      },
      onDone: () => setIsStreaming(false),
      onError: (msg) => {
        toast.error(msg);
        setIsStreaming(false);
      },
    });
  };

  const handleSaveConfig = () => {
    const missing = plugin.configFields.filter((f) => f.required && !configValues[f.key]?.trim());
    if (missing.length) {
      toast.error(`Please fill required fields: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    onConfigSaved(plugin.id);
    toast.success(`${plugin.name} integration saved! Configuration is now active.`);
    onOpenChange(false);
  };

  const updateField = (key: string, value: string) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full bg-card border-border p-0 flex flex-col" side="right">
        {/* Header */}
        <SheetHeader className="p-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-foreground">{plugin.name} Integration</SheetTitle>
              <SheetDescription className="text-xs">
                Configure your {plugin.provider} credentials · AI assistant ready to help
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Two-panel layout */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left: Config form */}
          <div className="lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border overflow-auto">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">Configuration</h3>
              </div>

              {plugin.configFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground text-xs">
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    {field.helpUrl && (
                      <a
                        href={field.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary flex items-center gap-0.5 hover:underline"
                      >
                        Get credentials <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                  <Input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={configValues[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="bg-secondary border-border text-xs h-9"
                  />
                </div>
              ))}

              <Separator className="bg-border" />

              <Button onClick={handleSaveConfig} className="w-full gap-2">
                <Check className="h-4 w-4" /> Save Integration
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Credentials are encrypted and stored securely via Callixis.
              </p>
            </div>
          </div>

          {/* Right: AI Chat */}
          <div className="lg:w-1/2 flex flex-col min-h-0">
            <div className="p-3 border-b border-border flex items-center gap-2 shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">AI Setup Assistant</span>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Online</Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 min-h-0">
              <div ref={scrollRef} className="p-3 space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {msg.content.split("\n").map((line, j) => (
                        <span key={j}>
                          {line
                            .split(/(\*\*.*?\*\*)/)
                            .map((part, k) =>
                              part.startsWith("**") && part.endsWith("**") ? (
                                <strong key={k}>{part.slice(2, -2)}</strong>
                              ) : (
                                part
                              )
                            )}
                          {j < msg.content.split("\n").length - 1 && <br />}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="bg-secondary rounded-lg px-3 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t border-border shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  ref={inputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask for help with setup..."
                  className="bg-secondary border-border text-xs h-9 flex-1"
                  disabled={isStreaming}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isStreaming || !chatInput.trim()}
                  className="h-9 w-9 p-0"
                >
                  {isStreaming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ── Activation Dialog ──────────────────────────────────
const ActivateDialog = ({
  plugin,
  open,
  onOpenChange,
  balance,
  onActivate,
}: {
  plugin: Plugin | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  balance: number;
  onActivate: (id: string, cost: number) => void;
}) => {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  if (!plugin) return null;

  const price = cycle === "monthly" ? plugin.priceMonthly : plugin.priceYearly;
  const savings = cycle === "yearly" ? plugin.priceMonthly * 12 - plugin.priceYearly : 0;
  const canAfford = balance >= price;
  const Icon = plugin.icon;

  const handleActivate = () => {
    if (!canAfford) { toast.error("Insufficient balance. Please deposit funds in Finance."); return; }
    onActivate(plugin.id, price);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Activate Plugin
          </DialogTitle>
          <DialogDescription>This will deduct from your Callixis wallet balance.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{plugin.name}</p>
            <p className="text-xs text-muted-foreground">{plugin.longDescription}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {plugin.features.map((f) => (
            <div key={f} className="flex items-center gap-2 text-xs">
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>

        <Separator className="bg-border" />

        <div className="flex gap-2">
          {(["monthly", "yearly"] as const).map((c) => {
            const p = c === "monthly" ? plugin.priceMonthly : plugin.priceYearly;
            return (
              <button key={c} onClick={() => setCycle(c)}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-center transition-colors relative ${
                  cycle === c ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:border-primary/30"
                }`}>
                <p className="text-sm font-medium">{formatCurrency(p)}</p>
                <p className="text-xs opacity-70">per {c === "monthly" ? "month" : "year"}</p>
                {c === "yearly" && savings > 0 && (
                  <Badge className="absolute -top-2 -right-2 bg-emerald-500 text-background text-[10px] px-1.5">
                    Save {formatCurrency(savings)}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <div className={`rounded-lg border p-3 flex items-center justify-between ${canAfford ? "border-emerald-500/20 bg-emerald-500/5" : "border-destructive/20 bg-destructive/5"}`}>
          <div className="flex items-center gap-2">
            <Wallet className={`h-4 w-4 ${canAfford ? "text-emerald-400" : "text-destructive"}`} />
            <span className="text-xs text-muted-foreground">Wallet Balance</span>
          </div>
          <div className="text-right">
            <p className={`text-sm font-semibold font-mono ${canAfford ? "text-emerald-400" : "text-destructive"}`}>{formatCurrency(balance)}</p>
            {!canAfford && <p className="text-[10px] text-destructive">Need {formatCurrency(price - balance)} more</p>}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleActivate} disabled={!canAfford}>
            {canAfford ? `Activate for ${formatCurrency(price)}` : "Insufficient Balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Deactivate Dialog ──────────────────────────────────
const DeactivateDialog = ({
  plugin, open, onOpenChange, onDeactivate,
}: {
  plugin: Plugin | null; open: boolean; onOpenChange: (o: boolean) => void; onDeactivate: (id: string) => void;
}) => {
  if (!plugin) return null;
  const Icon = plugin.icon;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Deactivate Plugin</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate <strong>{plugin.name}</strong>?
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 bg-secondary/50 rounded-lg p-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{plugin.name}</p>
            <p className="text-xs text-muted-foreground">{plugin.provider}</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild><Button variant="outline">Keep Active</Button></DialogClose>
          <Button variant="destructive" onClick={() => { onDeactivate(plugin.id); onOpenChange(false); }}>
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Plugin Card ────────────────────────────────────────
const PluginCard = ({
  plugin,
  isConfigured,
  onActivate,
  onDeactivate,
  onSetup,
  onDisconnect,
}: {
  plugin: Plugin;
  isConfigured: boolean;
  onActivate: (p: Plugin) => void;
  onDeactivate: (p: Plugin) => void;
  onSetup: (p: Plugin) => void;
  onDisconnect: (p: Plugin) => void;
}) => {
  const Icon = plugin.icon;
  const isActive = plugin.status === "active";

  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground truncate">{plugin.name}</h3>
              <Badge variant="outline" className={`text-xs shrink-0 ${statusStyles[plugin.status]}`}>
                {isActive && <Check className="h-3 w-3 mr-1" />}
                {isActive ? "Active" : "Available"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{plugin.description}</p>

            {/* Connection status indicator */}
            <div className="mt-2 flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${
                isConfigured
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}>
                {isConfigured ? (
                  <>
                    <LinkIcon className="h-3 w-3" />
                    <span>Connected</span>
                    <span className="relative flex h-1.5 w-1.5 ml-0.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    <span>Setup required</span>
                  </>
                )}
              </div>
              {isConfigured && (
                <button
                  onClick={() => onDisconnect(plugin)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
                >
                  <Unlink className="h-3 w-3" />
                  <span>Disconnect</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mt-2">
              <div>
                <span className="text-sm font-semibold text-primary font-mono">{formatCurrency(plugin.priceMonthly)}</span>
                <span className="text-xs text-muted-foreground">/mo</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-7 text-xs gap-1 ${
                    isConfigured
                      ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  }`}
                  onClick={() => onSetup(plugin)}
                >
                  <Settings className="h-3 w-3" /> {isConfigured ? "Configure" : "Setup"}
                </Button>
                {isActive ? (
                  <Button variant="outline" size="sm"
                    className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDeactivate(plugin)}>
                    Deactivate
                  </Button>
                ) : (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onActivate(plugin)}>
                    <Zap className="h-3 w-3" /> Activate
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Provider: {plugin.provider}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Main Page ──────────────────────────────────────────
const Plugins = () => {
  const [pluginStates, setPluginStates] = useState<Record<string, PluginStatus>>(
    Object.fromEntries(plugins.map((p) => [p.id, p.status]))
  );
  const [balance, setBalance] = useState(WALLET_BALANCE);
  const [activateTarget, setActivateTarget] = useState<Plugin | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Plugin | null>(null);
  const [setupTarget, setSetupTarget] = useState<Plugin | null>(null);
  // Track which plugins have been configured (active ones start as configured)
  const [configuredPlugins, setConfiguredPlugins] = useState<Record<string, boolean>>(
    Object.fromEntries(plugins.map((p) => [p.id, p.status === "active"]))
  );

  const activeCount = Object.values(pluginStates).filter((s) => s === "active").length;
  const configuredCount = Object.values(configuredPlugins).filter(Boolean).length;
  const monthlyCost = plugins.filter((p) => pluginStates[p.id] === "active").reduce((sum, p) => sum + p.priceMonthly, 0);

  const handleActivate = (id: string, cost: number) => {
    setPluginStates((prev) => ({ ...prev, [id]: "active" }));
    setBalance((prev) => prev - cost);
    const plugin = plugins.find((p) => p.id === id);
    toast.success(`${plugin?.name} activated! ${formatCurrency(cost)} deducted from your wallet.`);
  };

  const handleDeactivate = (id: string) => {
    setPluginStates((prev) => ({ ...prev, [id]: "available" }));
    const plugin = plugins.find((p) => p.id === id);
    toast.success(`${plugin?.name} deactivated. No further charges.`);
  };

  const handleConfigSaved = (pluginId: string) => {
    setConfiguredPlugins((prev) => ({ ...prev, [pluginId]: true }));
  };

  const handleDisconnect = (plugin: Plugin) => {
    setConfiguredPlugins((prev) => ({ ...prev, [plugin.id]: false }));
    toast.success(`${plugin.name} disconnected. Credentials have been cleared.`);
  };

  const enrichedPlugins = plugins.map((p) => ({ ...p, status: pluginStates[p.id] }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display text-foreground">Plugins</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Communication channels, AI tools & integrations — billed from your Callixis wallet
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Plugins</p>
              <p className="text-xl font-bold text-foreground">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly Cost</p>
              <p className="text-xl font-bold text-amber-400 font-mono">{formatCurrency(monthlyCost)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-emerald-400 font-mono">{formatCurrency(balance)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plugin grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {enrichedPlugins.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            isConfigured={!!configuredPlugins[plugin.id]}
            onActivate={(p) => setActivateTarget(p)}
            onDeactivate={(p) => setDeactivateTarget(p)}
            onSetup={(p) => setSetupTarget(p)}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      {/* Dialogs */}
      <ActivateDialog plugin={activateTarget} open={!!activateTarget}
        onOpenChange={(o) => !o && setActivateTarget(null)} balance={balance} onActivate={handleActivate} />
      <DeactivateDialog plugin={deactivateTarget} open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)} onDeactivate={handleDeactivate} />
      <IntegrationSheet plugin={setupTarget} open={!!setupTarget}
        onOpenChange={(o) => !o && setSetupTarget(null)} onConfigSaved={handleConfigSaved} />
    </div>
  );
};

export default Plugins;
