import { useState, useRef, useCallback } from "react";
import { Bot, Plus, Play, Pause, Wand2, X, ChevronRight, ChevronLeft, Mic, FileText, Zap, Globe, Volume2, Square } from "lucide-react";
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
  const [script, setScript] = useState("Hello! My name is {{agent_name}} and I'm calling from {{company}}. Am I speaking with {{lead_name}}?

[If yes]: Great! I'm reaching out because...
[If no]: No problem, when would be a good time to reach them?");
  const [voice, setVoice] = useState("sarah");
  const [speed, setSpeed] = useState([1.0]);
  const [enableCallbacks, setEnableCallbacks] = useState(true);
  const [enableTransfer, setEnableTransfer] = useState(false);
  const [trainingNotes, setTrainingNotes] = useState("");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoadingVoice, setIsLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getScriptPreview = useCallback(() => {
    return script
      .replace(/\{\{agent_name\}\}/g, agentName || "AI Agent")
      .replace(/\{\{company\}\}/g, "Your Company")
      .replace(/\{\{lead_name\}\}/g, "John")
      .replace(/\[.*?\]/g, "")
      .split("
")
      .filter(line => line.trim())
      .slice(0, 2)
      .join(" ")
      .slice(0, 120);
  }, [script, agentName]);

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

    const previewText = getScriptPreview() || `Hi, I'm ${voiceData.name}. I'll be your AI calling agent.`;

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
          body: JSON.stringify({ text: previewText, voiceId: voiceData.elevenLabsId }),
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
      console.error("Voice preview error:", err);
      toast({ title: "Voice Preview Error", description: "Could not generate voice preview.", variant: "destructive" });
    } finally {
      setIsLoadingVoice(null);
    }
  }, [playingVoice, getScriptPreview]);

  const canNext = () => {
    if (step === 0) return agentName.trim() && industry;
    if (step === 1) return script.trim().length > 20;
    return true;
  };

  const handleDeploy = () => {
    toast({ title: "Agent Deployed!", description: `${agentName} is now in training mode.` });
    onClose();
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
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-1.5 rounded-full flex-1 transition-colors ${i <= step ? "bg-primary shadow-[0_0_10px_rgba(0,255,255,0.3)]" : "bg-border"}`} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-6 px-1 font-bold uppercase tracking-wider">
          {WIZARD_STEPS.map((s, i) => (
            <span key={s} className={i === step ? "text-primary" : ""}>{s}</span>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-2">
              <Label className="text-sm">Agent Name</Label>
              <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. LeadGen Pro" className="bg-secondary/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Target Geography</Label>
              <Input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="e.g. US Nationwide" className="bg-secondary/50 border-border" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-primary" /> Call Script</Label>
              <p className="text-[11px] text-muted-foreground">Use {"{{variables}}"} for dynamic content.</p>
              <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={10} className="bg-secondary/50 border-border font-mono text-xs" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={enableCallbacks} onCheckedChange={setEnableCallbacks} />
                <Label className="text-xs">Enable callback scheduling</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={enableTransfer} onCheckedChange={setEnableTransfer} />
                <Label className="text-xs">Enable live transfer</Label>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Label className="flex items-center gap-2 text-sm"><Volume2 className="h-4 w-4 text-primary" /> Select Voice</Label>
            <div className="grid grid-cols-2 gap-3">
              {VOICES.map((v) => {
                const isPlaying = playingVoice === v.id;
                const isLoading = isLoadingVoice === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={`p-4 rounded-lg border text-left transition-all relative overflow-hidden ${
                      voice === v.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{v.name}</p>
                        <p className="text-[10px] text-muted-foreground">{v.accent}</p>
                      </div>
                      <div
                        role="button"
                        onClick={(e) => handlePlayVoice(v.id, e)}
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          isPlaying ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary"
                        }`}
                      >
                        {isLoading ? <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : isPlaying ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2 mt-4">
              <Label className="text-xs">Speech Speed: {speed[0]}x</Label>
              <Slider value={speed} onValueChange={setSpeed} min={0.5} max={2.0} step={0.1} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Label className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4 text-primary" /> Training Data & Notes</Label>
            <Textarea value={trainingNotes} onChange={(e) => setTrainingNotes(e.target.value)} rows={8} className="bg-secondary/50 border-border text-sm" placeholder="Provide additional context, objection handling tips, or FAQ data..." />
            <div className="mt-3 border-2 border-dashed border-border rounded-lg p-6 text-center bg-secondary/20">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-xs text-muted-foreground">Drop files here or click to upload</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-3 border border-border">
              {[
                { label: "Agent Name", value: agentName },
                { label: "Industry", value: industry },
                { label: "Geography", value: geo || "Not specified" },
                { label: "Voice", value: VOICES.find((v) => v.id === voice)?.name || voice },
                { label: "Speed", value: `${speed[0]}x` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-xs border-b border-border/50 pb-2 last:border-0">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()} className="h-9 px-4">
            {step > 0 ? <><ChevronLeft className="h-4 w-4 mr-1" /> Back</> : "Cancel"}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()} className="h-9 px-6 glow-cyan">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleDeploy} className="h-9 px-6 glow-cyan">
              <Zap className="h-4 w-4 mr-2" /> Deploy Agent
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AIAgents = () => {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">AI Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Deploy and manage your AI voice agents</p>
        </div>
        <Button className="glow-cyan h-10 px-5 shadow-lg shadow-primary/20" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Deploy Agent
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {initialAgents.map((agent, i) => (
          <Card key={i} className="bg-card rounded-xl border border-border p-5 hover:border-primary/30 transition-all group hover:shadow-[0_0_20px_rgba(0,255,255,0.05)]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{agent.industry}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${statusStyles[agent.status]}`}>{agent.status}</span>
            </div>
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Calls</p>
                  <p className="text-xs text-foreground font-mono">{agent.calls}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Success</p>
                  <p className="text-xs text-foreground font-mono">{agent.successRate}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors">
                {agent.status === "Running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-inner">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest p-4">Queue</th>
              <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest p-4 text-center">Active Calls</th>
              <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest p-4 text-right">Avg Wait</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {[
              { name: "Sales", activeCalls: 8, avgWait: "12s" },
              { name: "Customer Service", activeCalls: 6, avgWait: "8s" },
              { name: "Support", activeCalls: 4, avgWait: "5s" },
            ].map((q, i) => (
              <tr key={i} className="hover:bg-secondary/10 transition-colors">
                <td className="p-4 text-sm text-foreground font-semibold">{q.name}</td>
                <td className="p-4 text-sm text-primary font-mono text-center">{q.activeCalls}</td>
                <td className="p-4 text-sm text-muted-foreground text-right">{q.avgWait}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AgentWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
};

export default AIAgents;
