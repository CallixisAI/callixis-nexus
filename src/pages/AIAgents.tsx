import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Plus, Play, Pause, Wand2, ChevronRight, ChevronLeft, FileText, Zap, Volume2, Square, MessageSquare, Loader2, BrainCircuit } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
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
                <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Default AI" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Callixis AI</SelectItem>
                  {activePlugins.map(p => (
                    <SelectItem key={p.plugin_id} value={p.plugin_id} className="text-primary font-medium">
                      {p.plugin_id === 'n8n' ? "n8n Automation (Active)" : p.plugin_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Active plugins from your Marketplace appear here.</p>
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
        <div><h1 className="text-2xl font-display text-foreground">AI Agents</h1><p className="text-sm text-muted-foreground mt-1">Connect your plugins to your agents.</p></div>
        <Button className="glow-cyan" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Deploy Agent</Button>
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
              <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1"><MessageSquare className="h-3 w-3" /> Chat Test</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"><Play className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
      <AgentWizard open={wizardOpen} onClose={() => setWizardOpen(false)} activePlugins={activePlugins} />
    </div>
  );
};

export default AIAgents;
