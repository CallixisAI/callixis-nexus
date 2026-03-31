import { useState, useRef, useCallback } from "react";
import { Bot, Plus, Play, Pause, Wand2, ChevronRight, ChevronLeft, FileText, Zap, Volume2, Square } from "lucide-react";
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

const initialAgents = [
  { name: "LeadGen Pro", industry: "Real Estate", status: "Running", calls: "2,340/day", successRate: "18%" },
  { name: "InsureBot", industry: "Insurance", status: "Running", calls: "1,800/day", successRate: "14%" },
  { name: "MedScheduler", industry: "Medical", status: "Paused", calls: "0/day", successRate: "24%" },
  { name: "AutoSales AI", industry: "Car Sales", status: "Running", calls: "960/day", successRate: "11%" },
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

const WIZARD_STEPS = ["Basics", "Script", "Voice & Tone", "Training", "Review"];

const AgentWizard = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [step, setStep] = useState(0);
  const [agentName, setAgentName] = useState("");
  const [industry, setIndustry] = useState("");
  const [geo, setGeo] = useState("");
  const [script, setScript] = useState("Hello! My name is {{agent_name}} and I'm calling from {{company}}.");
  const [voice, setVoice] = useState("sarah");
  const [speed, setSpeed] = useState([1.0]);
  const [enableCallbacks, setEnableCallbacks] = useState(true);
  const [enableTransfer, setEnableTransfer] = useState(false);
  const [trainingNotes, setTrainingNotes] = useState("");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoadingVoice, setIsLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayVoice = useCallback(async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingVoice === voiceId) {
      setPlayingVoice(null);
      return;
    }

    const voiceData = VOICES.find(v => v.id === voiceId);
    if (!voiceData) return;

    setIsLoadingVoice(voiceId);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: "Hello, I am ready to serve.", voiceId: voiceData.elevenLabsId }),
        }
      );

      if (!response.ok) throw new Error("TTS request failed");

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingVoice(null);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
      setPlayingVoice(voiceId);
    } catch (err) {
      toast({ title: "Voice Preview Error", variant: "destructive" });
    } finally {
      setIsLoadingVoice(null);
    }
  }, [playingVoice]);

  const canNext = () => {
    if (step === 0) return agentName.trim() && industry;
    if (step === 1) return script.trim().length > 10;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2 font-display text-xl">
            <Wand2 className="h-5 w-5 text-primary" /> Create AI Agent
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 mb-4">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full flex-1 transition-colors ${i <= step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-6 px-1 font-bold uppercase">
          {WIZARD_STEPS.map((s, i) => (
            <span key={s} className={i === step ? "text-primary" : ""}>{s}</span>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="LeadGen Pro" className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Script</Label>
            <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={8} className="bg-secondary/50" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Label>Select Voice</Label>
            <div className="grid grid-cols-2 gap-3">
              {VOICES.map((v) => (
                <button key={v.id} onClick={() => setVoice(v.id)} className={`p-4 rounded-lg border text-left ${voice === v.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50"}`}>
                  <div className="flex justify-between items-center">
                    <span>{v.name}</span>
                    <div onClick={(e) => handlePlayVoice(v.id, e)}>{playingVoice === v.id ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8 pt-4 border-t">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step > 0 ? "Back" : "Cancel"}</Button>
          {step < 4 ? <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>Next</Button> : <Button onClick={() => onClose()} className="glow-cyan">Deploy</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AIAgents = () => {
  const [wizardOpen, setWizardOpen] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-display">AI Agents</h1><p className="text-sm text-muted-foreground mt-1">Manage your agents</p></div>
        <Button className="glow-cyan" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Deploy Agent</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {initialAgents.map((agent, i) => (
          <Card key={i} className="p-5 border-border bg-card">
            <div className="flex justify-between"><h3 className="font-bold">{agent.name}</h3><Badge className="bg-primary/10 text-primary">{agent.status}</Badge></div>
            <div className="mt-4 pt-4 border-t flex justify-end"><Button variant="ghost" size="icon"><Play className="h-4 w-4" /></Button></div>
          </Card>
        ))}
      </div>
      <AgentWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
};

export default AIAgents;
