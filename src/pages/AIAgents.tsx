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
import { toast } from "@/hooks/use-toast";

const agents = [
  { name: "LeadGen Pro", industry: "Real Estate", status: "Running", calls: "2,340/day", successRate: "18%" },
  { name: "InsureBot", industry: "Insurance", status: "Running", calls: "1,800/day", successRate: "14%" },
  { name: "MedScheduler", industry: "Medical", status: "Paused", calls: "0/day", successRate: "24%" },
  { name: "AutoSales AI", industry: "Car Sales", status: "Running", calls: "960/day", successRate: "11%" },
  { name: "FinanceAssist", industry: "Finance", status: "Running", calls: "1,200/day", successRate: "15%" },
  { name: "HomeReno Bot", industry: "Home Improvement", status: "Training", calls: "0/day", successRate: "—" },
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
  const [script, setScript] = useState("Hello! My name is {{agent_name}} and I'm calling from {{company}}. Am I speaking with {{lead_name}}?\n\n[If yes]: Great! I'm reaching out because...\n[If no]: No problem, when would be a good time to reach them?");
  const [voice, setVoice] = useState("sarah");
  const [speed, setSpeed] = useState([1.0]);
  const [enableCallbacks, setEnableCallbacks] = useState(true);
  const [enableTransfer, setEnableTransfer] = useState(false);
  const [trainingNotes, setTrainingNotes] = useState("");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoadingVoice, setIsLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const getScriptPreview = useCallback(() => {
    return script
      .replace(/\{\{agent_name\}\}/g, agentName || "AI Agent")
      .replace(/\{\{company\}\}/g, "Your Company")
      .replace(/\{\{lead_name\}\}/g, "John")
      .replace(/\[.*?\]/g, "")
      .split("\n")
      .filter(line => line.trim())
      .slice(0, 2)
      .join(" ")
      .slice(0, 120);
  }, [script, agentName]);

  const handlePlayVoice = useCallback(async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Stop currently playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingVoice) {
      clearInterval(progressIntervals.current[playingVoice]);
      delete progressIntervals.current[playingVoice];
      if (playingVoice === voiceId) {
        setPlayingVoice(null);
        return;
      }
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
      toast({ title: "Voice Preview Error", description: "Could not generate voice preview. Please try again.", variant: "destructive" });
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
    toast({ title: "Agent Deployed!", description: `${agentName} is now in training mode. It will go live after initial calibration.` });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" /> Create AI Agent
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-1.5 rounded-full flex-1 transition-colors ${i <= step ? "bg-primary" : "bg-border"}`} />
              {i < WIZARD_STEPS.length - 1 && <div className="w-1" />}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-4 px-1">
          {WIZARD_STEPS.map((s, i) => (
            <span key={s} className={i === step ? "text-primary font-medium" : ""}>{s}</span>
          ))}
        </div>

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. LeadGen Pro" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Geography</Label>
              <Input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="e.g. US Nationwide, UK, EU" className="bg-secondary border-border" />
            </div>
          </div>
        )}

        {/* Step 1: Script */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Call Script</Label>
              <p className="text-xs text-muted-foreground">Use {"{{variables}}"} for dynamic content. The AI will adapt based on conversation flow.</p>
              <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={10} className="bg-secondary border-border font-mono text-xs" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={enableCallbacks} onCheckedChange={setEnableCallbacks} />
                <Label className="text-sm">Enable callback scheduling</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={enableTransfer} onCheckedChange={setEnableTransfer} />
                <Label className="text-sm">Enable live transfer</Label>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Voice */}
        {step === 2 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-primary" /> Select Voice</Label>
            <div className="grid grid-cols-2 gap-3">
              {VOICES.map((v) => {
                const isPlaying = playingVoice === v.id;
                const isLoading = isLoadingVoice === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={`p-4 rounded-lg border text-left transition-all relative overflow-hidden ${
                      voice === v.id ? "border-primary bg-primary/10 glow-cyan" : "border-border bg-secondary hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{v.accent}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{v.desc}</p>
                      </div>
                      <div
                        role="button"
                        onClick={(e) => handlePlayVoice(v.id, e)}
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          isPlaying
                            ? "bg-primary text-primary-foreground"
                            : isLoading
                            ? "bg-muted text-muted-foreground animate-pulse"
                            : "bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary"
                        }`}
                        title={isPlaying ? "Stop preview" : isLoading ? "Loading..." : `Preview ${v.name}'s voice`}
                      >
                        {isLoading ? (
                          <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : isPlaying ? (
                          <Square className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3 ml-0.5" />
                        )}
                      </div>
                    </div>
                    {isPlaying && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-[10px] text-primary italic truncate">
                          "{getScriptPreview()}"
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label>Speech Speed: {speed[0]}x</Label>
              <Slider value={speed} onValueChange={setSpeed} min={0.5} max={2.0} step={0.1} className="w-full" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Slow</span><span>Normal</span><span>Fast</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Training */}
        {step === 3 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Training Data & Notes</Label>
            <p className="text-xs text-muted-foreground">Provide additional context, objection handling tips, or FAQ data for the AI to learn from.</p>
            <Textarea value={trainingNotes} onChange={(e) => setTrainingNotes(e.target.value)} rows={8} className="bg-secondary border-border" placeholder="e.g. Common objections: 'I'm not interested' → respond with value proposition. Always mention the free consultation offer..." />
            <div className="bg-secondary/50 rounded-lg p-4 border border-border">
              <p className="text-sm font-medium text-foreground mb-2">Upload Training Files</p>
              <p className="text-xs text-muted-foreground">Drag & drop CSV, PDF, or TXT files with past call data, FAQs, or product info.</p>
              <div className="mt-3 border-2 border-dashed border-border rounded-lg p-6 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Drop files here or click to upload</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
              {[
                { label: "Agent Name", value: agentName },
                { label: "Industry", value: industry },
                { label: "Geography", value: geo || "Not specified" },
                { label: "Voice", value: VOICES.find((v) => v.id === voice)?.name || voice },
                { label: "Speed", value: `${speed[0]}x` },
                { label: "Callbacks", value: enableCallbacks ? "Enabled" : "Disabled" },
                { label: "Live Transfer", value: enableTransfer ? "Enabled" : "Disabled" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Script Preview</Label>
              <div className="bg-secondary rounded-lg p-3 text-xs font-mono text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                {script.slice(0, 300)}{script.length > 300 ? "..." : ""}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()} className="gap-1">
            {step > 0 ? <><ChevronLeft className="h-4 w-4" /> Back</> : "Cancel"}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()} className="gap-1 glow-cyan">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleDeploy} className="gap-1 glow-cyan">
              <Zap className="h-4 w-4" /> Deploy Agent
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">AI Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Deploy and manage your AI voice agents</p>
        </div>
        <Button className="glow-cyan" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Deploy Agent
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-5 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{agent.industry}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[agent.status]}`}>{agent.status}</span>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Calls</p>
                <p className="text-sm text-foreground">{agent.calls}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Success</p>
                <p className="text-sm text-foreground">{agent.successRate}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {agent.status === "Running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Agent Queues */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground p-4">Queue</th>
              <th className="text-left text-xs font-medium text-muted-foreground p-4">Agents</th>
              <th className="text-left text-xs font-medium text-muted-foreground p-4">Active Calls</th>
              <th className="text-left text-xs font-medium text-muted-foreground p-4">Waiting</th>
              <th className="text-left text-xs font-medium text-muted-foreground p-4">Avg Wait</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Sales", agents: 12, activeCalls: 8, waiting: 3, avgWait: "12s" },
              { name: "Customer Service", agents: 8, activeCalls: 6, waiting: 1, avgWait: "8s" },
              { name: "Support", agents: 6, activeCalls: 4, waiting: 0, avgWait: "5s" },
              { name: "Billing", agents: 4, activeCalls: 3, waiting: 2, avgWait: "18s" },
            ].map((q, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="p-4 text-sm text-foreground font-medium">{q.name}</td>
                <td className="p-4 text-sm text-muted-foreground">{q.agents}</td>
                <td className="p-4 text-sm text-primary">{q.activeCalls}</td>
                <td className="p-4 text-sm text-muted-foreground">{q.waiting}</td>
                <td className="p-4 text-sm text-muted-foreground">{q.avgWait}</td>
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
