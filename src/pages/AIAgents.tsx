import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Plus, Play, Pause, Wand2, X, ChevronRight, ChevronLeft, Mic, FileText, Zap, Globe, Volume2, Square, Link as LinkIcon, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const agents = [
  { id: "1", name: "LeadGen Pro", industry: "Real Estate", status: "Running", calls: "2,340/day", successRate: "18%", n8n_webhook_url: "https://n8n.example.com/webhook/test" },
  { id: "2", name: "InsureBot", industry: "Insurance", status: "Running", calls: "1,800/day", successRate: "14%", n8n_webhook_url: null },
  { id: "3", name: "MedScheduler", industry: "Medical", status: "Paused", calls: "0/day", successRate: "24%", n8n_webhook_url: null },
  { id: "4", name: "AutoSales AI", industry: "Car Sales", status: "Running", calls: "960/day", successRate: "11%", n8n_webhook_url: null },
];

const statusStyles: Record<string, string> = {
  Running: "text-primary bg-primary/10",
  Paused: "text-yellow-400 bg-yellow-400/10",
  Training: "text-blue-400 bg-blue-400/10",
};

const VOICES = [
  { id: "sarah", name: "Sarah", accent: "US Female", desc: "Warm, professional", elevenLabsId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "james", name: "James", accent: "US Male", desc: "Confident, authoritative", elevenLabsId: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "emma", name: "Emma", accent: "UK Female", desc: "Friendly, conversational", elevenLabsId: "Xb7hH8MSUJpSbSDYk0k2" },
  { id: "alex", name: "Alex", accent: "US Neutral", desc: "Calm, trustworthy", elevenLabsId: "SAz9YHcvj6GT2YYXdXww" },
];

const INDUSTRIES = ["Real Estate", "Insurance", "Medical", "Finance", "Car Sales", "Home Improvement", "E-commerce", "SaaS", "Other"];

const AgentWizard = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { role } = useAuth();
  
  const [step, setStep] = useState(0);
  const [agentName, setAgentName] = useState("");
  const [industry, setIndustry] = useState("");
  const [geo, setGeo] = useState("");
  const [script, setScript] = useState("Hello! My name is {{agent_name}} and I'm calling from {{company}}.");
  const [voice, setVoice] = useState("sarah");
  const [speed, setSpeed] = useState([1.0]);
  const [n8nUrl, setN8nUrl] = useState("");
  const [isTestingN8n, setIsTestingN8n] = useState(false);
  const [n8nStatus, setN8nStatus] = useState<"idle" | "success" | "error">("idle");
  const [trainingNotes, setTrainingNotes] = useState("");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoadingVoice, setIsLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // DEBUG: We are going to FORCE n8n step for everyone right now to prove it works
  const FORCE_SHOW_ALL = true;
  const isAdmin = role?.toLowerCase() === "admin" || FORCE_SHOW_ALL;
  const WIZARD_STEPS = ["Basics", "Script", "Voice & Tone", ...(isAdmin ? ["n8n Integration"] : []), "Training", "Review"];

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  const handleTestN8n = async () => {
    if (!n8nUrl) return;
    setIsTestingN8n(true);
    try {
      await fetch(n8nUrl, { method: "POST", mode: 'no-cors', body: JSON.stringify({ test: true }) });
      setN8nStatus("success");
      toast({ title: "Signal Sent", description: "Payload dispatched." });
    } catch (err) {
      setN8nStatus("error");
    } finally {
      setIsTestingN8n(false);
    }
  };

  const handlePlayVoice = useCallback(async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playingVoice === voiceId) { setPlayingVoice(null); return; }
    const voiceData = VOICES.find(v => v.id === voiceId);
    if (!voiceData) return;
    setIsLoadingVoice(voiceId);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ text: "Previewing voice.", voiceId: voiceData.elevenLabsId }),
      });
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(audioUrl); };
      await audio.play();
      setPlayingVoice(voiceId);
    } catch (err) {
      toast({ title: "Voice Preview Error", variant: "destructive" });
    } finally { setIsLoadingVoice(null); }
  }, [playingVoice]);

  const canNext = () => {
    if (step === 0) return agentName.trim() && industry;
    return true;
  };

  const maxStep = WIZARD_STEPS.length - 1;

  const renderStepContent = () => {
    const currentStepName = WIZARD_STEPS[step];
    switch (currentStepName) {
      case "Basics":
        return (<div className="space-y-4"><Label>Agent Name</Label><Input value={agentName} onChange={e => setAgentName(e.target.value)} className="bg-secondary" /><Label>Industry</Label><Select value={industry} onValueChange={setIndustry}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>);
      case "Script":
        return (<div className="space-y-4"><Label>Call Script</Label><Textarea value={script} onChange={e => setScript(e.target.value)} rows={6} className="bg-secondary" /></div>);
      case "Voice & Tone":
        return (<div className="space-y-4"><div className="grid grid-cols-2 gap-2">{VOICES.map(v => (<button key={v.id} onClick={() => setVoice(v.id)} className={`p-3 rounded border ${voice === v.id ? "border-primary bg-primary/10" : "bg-secondary"}`}>{v.name} <div role="button" onClick={e => handlePlayVoice(v.id, e)} className="inline-block ml-2">{playingVoice === v.id ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}</div></button>))}</div></div>);
      case "n8n Integration":
        return (<div className="space-y-4"><div className="p-3 bg-primary/10 rounded border border-primary/20"><p className="text-sm font-bold">n8n Background Logic</p></div><Label>Webhook URL</Label><div className="flex gap-2"><Input value={n8nUrl} onChange={e => setN8nUrl(e.target.value)} placeholder="https://..." /><Button onClick={handleTestN8n} disabled={isTestingN8n}>{isTestingN8n ? "..." : "Test"}</Button></div></div>);
      case "Training":
        return (<div className="space-y-4"><Label>Notes</Label><Textarea value={trainingNotes} onChange={e => setTrainingNotes(e.target.value)} rows={4} className="bg-secondary" /></div>);
      case "Review":
        return (<div className="space-y-4"><p>Name: {agentName}</p><p>Industry: {industry}</p><p>n8n: {n8nUrl ? "YES" : "NO"}</p></div>);
      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" /> Create AI Agent</DialogTitle></DialogHeader>
        <div className="flex gap-1 mb-4">{WIZARD_STEPS.map((s, i) => (<div key={s} className={`h-1 flex-1 rounded ${i <= step ? "bg-primary" : "bg-border"}`} />))}</div>
        <div className="flex justify-between text-[10px] mb-4">{WIZARD_STEPS.map((s, i) => (<span key={s} className={i === step ? "text-primary font-bold" : "text-muted-foreground"}>{s}</span>))}</div>
        {renderStepContent()}
        <div className="flex justify-between mt-6 border-t pt-4">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step > 0 ? "Back" : "Cancel"}</Button>
          {step < maxStep ? <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>Next</Button> : <Button onClick={() => { toast({ title: "Deployed!" }); onClose(); }} className="glow-cyan">Deploy</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AIAgents = () => {
  const { role } = useAuth();
  const isAdmin = role?.toLowerCase() === "admin";
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-display">AI Agents</h1><p className="text-sm text-muted-foreground mt-1">Manage voice agents</p></div>
        <Button className="glow-cyan" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Deploy Agent</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Card key={agent.id} className="bg-card border p-5 group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center"><Bot className="h-5 w-5 text-primary" /></div>
                <div><h3 className="text-sm font-bold">{agent.name}</h3><p className="text-xs text-muted-foreground">{agent.industry}</p></div>
              </div>
              <span className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary">{agent.status}</span>
            </div>
            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              {isAdmin && <Button variant="outline" size="sm" className="h-7 text-[10px]">Test n8n</Button>}
              <div className="flex gap-1"><Button variant="ghost" size="icon" className="h-8 w-8"><Play className="h-4 w-4" /></Button></div>
            </div>
          </Card>
        ))}
      </div>
      <AgentWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
};

export default AIAgents;
