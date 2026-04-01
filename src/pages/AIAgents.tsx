import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Plus, Play, Pause, Wand2, ChevronRight, ChevronLeft, FileText, Zap, Volume2, Square, MessageSquare, Loader2, BrainCircuit, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const initialAgents = [
  { id: "1", name: "LeadGen Pro", industry: "Real Estate", status: "Running", calls: "2,340/day", successRate: "18%" },
  { id: "2", name: "InsureBot", industry: "Insurance", status: "Running", calls: "1,800/day", successRate: "14%" },
];

const statusStyles: Record<string, string> = {
  Running: "text-primary bg-primary/10",
  Paused: "text-yellow-400 bg-yellow-400/10",
  Training: "text-blue-400 bg-blue-400/10",
};

const VOICES = [
  { id: "sarah", name: "Sarah", accent: "US Female", desc: "Warm, professional", elevenLabsId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "james", name: "James", accent: "US Male", desc: "Confident, authoritative", elevenLabsId: "JBFqnCBsd6RMkjVDRZzb" },
];

const INDUSTRIES = ["Real Estate", "Insurance", "Medical", "Finance", "Car Sales", "Home Improvement", "Other"];

// ── Test Chat Component ────────────────────────────────
const TestChatDialog = ({ agent, open, onClose }: { agent: any; open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && agent) {
      setMessages([{ role: "assistant", content: `Hello! I am ${agent.name}. How can I help you?` }]);
    } else {
      setMessages([]);
    }
  }, [open, agent]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !agent) return;
    const userMsg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      const { data: plugin } = await supabase
        .from("user_plugins")
        .select("config")
        .eq("user_id", user?.id)
        .eq("plugin_id", "n8n")
        .single();

      const webhookUrl = plugin?.config?.webhookUrl;

      if (!webhookUrl) {
        setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Error: No n8n Webhook URL found in Plugins." }]);
      } else {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: currentInput,
            agent_id: agent.id,
            agent_name: agent.name,
            timestamp: new Date().toISOString()
          })
        });

        if (response.ok) {
          const result = await response.json();
          const reply = result.output || result.message || "n8n received the message.";
          setMessages(prev => [...prev, { role: "assistant", content: reply }]);
        } else {
          throw new Error();
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Connection Failed. Check n8n settings." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border flex flex-col h-[500px] overflow-hidden">
        <DialogHeader className="border-b border-border pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Test: {agent.name}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 p-4 min-h-0">
          <div ref={scrollRef} className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground border border-border'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border shrink-0 flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." onKeyDown={e => e.key === 'Enter' && handleSend()} className="bg-secondary border-border" />
          <Button onClick={handleSend} disabled={isLoading} className="glow-cyan"><Send className="h-4 w-4" /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Main Wizard Component ──────────────────────────────
const AgentWizard = ({ open, onClose, activePlugins }: { open: boolean; onClose: () => void; activePlugins: any[] }) => {
  const [step, setStep] = useState(0);
  const [agentName, setAgentName] = useState("");
  const [industry, setIndustry] = useState("");
  const [script, setScript] = useState("Hello! My name is {{agent_name}}.");
  const [voice, setVoice] = useState("sarah");
  const [logicProvider, setLogicProvider] = useState("default");
  
  const WIZARD_STEPS = ["Basics", "Script", "Brain & Logic", "Review"];
  const maxStep = WIZARD_STEPS.length - 1;

  useEffect(() => { if (!open) setStep(0); }, [open]);

  const canNext = () => {
    if (step === 0) return agentName.trim() && industry;
    if (step === 1) return script.trim().length > 5;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2 font-display text-xl"><Wand2 className="h-5 w-5 text-primary" /> Create AI Agent</DialogTitle></DialogHeader>
        <div className="flex items-center gap-1 mb-4">{WIZARD_STEPS.map((s, i) => (<div key={s} className={`h-1.5 rounded-full flex-1 transition-colors ${i <= step ? "bg-primary" : "bg-border"}`} />))}</div>
        
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Agent Name</Label><Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="LeadGen Pro" className="bg-secondary/50" /></div>
            <div className="space-y-2"><Label>Industry</Label><Select value={industry} onValueChange={setIndustry}><SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Call Script</Label>
            <Textarea value={script} onChange={e => setScript(e.target.value)} rows={8} className="bg-secondary/50" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary" /> Select Logic Provider (The Brain)</Label>
              <Select value={logicProvider} onValueChange={setLogicProvider}>
                <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Default Callixis AI" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Callixis AI</SelectItem>
                  {activePlugins.map(p => (
                    <SelectItem key={p.plugin_id} value={p.plugin_id} className="text-primary font-medium">
                      {p.plugin_id === 'n8n' ? "n8n Automation (Active)" : p.plugin_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Voice</Label>
              <div className="grid grid-cols-2 gap-2">
                {VOICES.map(v => (
                  <button key={v.id} onClick={() => setVoice(v.id)} className={`p-3 rounded-lg border text-sm text-left ${voice === v.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50"}`}>{v.name}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 bg-secondary/30 p-4 rounded-lg border border-border">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Agent:</span><span>{agentName}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Logic:</span><span className="text-primary font-bold uppercase">{logicProvider}</span></div>
          </div>
        )}

        <div className="flex justify-between mt-8 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step > 0 ? "Back" : "Cancel"}</Button>
          {step < maxStep ? <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>Next</Button> : <Button onClick={onClose} className="glow-cyan">Deploy Agent</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AIAgents = () => {
  const { user } = useAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [testAgent, setTestAgent] = useState<any | null>(null);

  useEffect(() => {
    const loadPlugins = async () => {
      if (!user) return;
      const { data } = await supabase.from("user_plugins").select("plugin_id, status").eq("user_id", user.id).eq("status", "active");
      if (data) setActivePlugins(data);
    };
    loadPlugins();
  }, [user]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-display text-foreground">AI Agents</h1><p className="text-sm text-muted-foreground mt-1 text-glow-none">Deploy and manage your agents.</p></div>
        <Button className="glow-cyan h-10 px-5" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Deploy Agent</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {initialAgents.map((agent) => (
          <Card key={agent.id} className="bg-card border-border p-5 group hover:border-primary/30 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Bot className="h-5 w-5 text-primary" /></div>
                <div><h3 className="text-sm font-bold text-foreground">{agent.name}</h3><p className="text-xs text-muted-foreground">{agent.industry}</p></div>
              </div>
              <Badge variant="outline" className={statusStyles[agent.status]}>{agent.status}</Badge>
            </div>
            <div className="mt-6 pt-4 border-t border-border/50 flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={() => setTestAgent(agent)} className="h-8 text-[10px] gap-1"><MessageSquare className="h-3 w-3" /> Chat Test</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"><Play className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
      <AgentWizard open={wizardOpen} onClose={() => setWizardOpen(false)} activePlugins={activePlugins} />
      {testAgent && <TestChatDialog agent={testAgent} open={!!testAgent} onClose={() => setTestAgent(null)} />}
    </div>
  );
};

export default AIAgents;
