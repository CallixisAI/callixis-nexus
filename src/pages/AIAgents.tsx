import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Plus, Play, Pause, Wand2, ChevronRight, ChevronLeft, FileText, Zap, Volume2, Square, MessageSquare, Loader2, BrainCircuit, Send, X, Check } from "lucide-react";
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
  Idle: "text-muted-foreground bg-secondary/50",
};

// ── Voice Registry ─────────────────────────────────────
const VOICE_REGISTRY = [
  // --- ElevenLabs (High Quality) ---
  { id: "eleven-sarah", name: "Sarah", provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", language: "en", flag: "🇺🇸", desc: "Warm, professional" },
  { id: "eleven-james", name: "James", provider: "elevenlabs", voiceId: "JBFqnCBsd6RMkjVDRZzb", language: "en", flag: "🇺🇸", desc: "Confident, authoritative" },
  { id: "eleven-bella", name: "Bella", provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", language: "en", flag: "🇺🇸", desc: "Soft, gentle" },
  { id: "eleven-antonio", name: "Antonio", provider: "elevenlabs", voiceId: "onwK4e9ZLuTAKqWW03F9", language: "es", flag: "🇪🇸", desc: "Deep, Spanish Male" },
  { id: "eleven-marcela", name: "Marcela", provider: "elevenlabs", voiceId: "ThT5KcBe7VKqLAbHBaAt", language: "es", flag: "🇲🇽", desc: "Professional, Mexican Female" },
  
  // --- Vapi / Play.ht ---
  { id: "vapi-aria", name: "Aria", provider: "vapi", voiceId: "aria", language: "en", flag: "🇺🇸", desc: "Fast, conversational" },
  { id: "vapi-roger", name: "Roger", provider: "vapi", voiceId: "roger", language: "en", flag: "🇬🇧", desc: "British, articulate" },
  { id: "vapi-sofia", name: "Sofia", provider: "vapi", voiceId: "sofia", language: "pt", flag: "🇧🇷", desc: "Portuguese, friendly" },
];

const INDUSTRIES = ["Real Estate", "Insurance", "Medical", "Finance", "Car Sales", "Home Improvement", "Other"];

// ── Test Chat Component ────────────────────────────────
const TestChatDialog = ({ agent, open, onClose }: { agent: any; open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setInput(text);
        setIsListening(false);
        // Auto-send if needed: handleSend(text);
      };
      recognitionRef.current.onend = () => setIsListening(false);
      recognitionRef.current.onerror = () => setIsListening(false);
    }
  }, []);

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

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const speakText = async (text: string, overrideVoiceId?: string) => {
    const vId = overrideVoiceId || agent.voice_settings?.voiceId;
    if (!vId || isSpeaking) return;
    setIsSpeaking(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-tts', {
        body: { text, voiceId: vId }
      });
      if (error) throw error;
      
      // Use Blob and URL.createObjectURL instead of Base64 for better performance
      const audioBlob = data;
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.play();
    } catch (err) {
      console.error("Speech error:", err);
      setIsSpeaking(false);
      toast.error("Voice preview failed. Check API key.");
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading || !agent) return;
    
    const userMsg = { role: "user", content: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('n8n-proxy', {
        body: { 
          message: textToSend,
          agent_id: agent.id,
          agent_name: agent.name,
          user_id: user?.id
        }
      });

      if (error) throw error;

      const reply = data.output || data.message || data.data || "Message received by n8n proxy.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      // Speak the reply!
      speakText(reply);
      
    } catch (err: any) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `⚠️ Error: ${err.message || "Connection failed. Check n8n logs."}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border flex flex-col h-[500px] overflow-hidden">
        <DialogHeader className="border-b border-border pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2 font-display text-xl"><Wand2 className="h-5 w-5 text-primary" /> Test: {agent.name}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 p-4 min-h-0">
          <div ref={scrollRef} className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(0,229,160,0.2)]' : 'bg-secondary text-foreground border border-border'}`}>
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

        <div className="p-4 border-t border-border shrink-0 flex gap-2 items-center">
          <Button onClick={toggleListening} variant="outline" size="icon" className={`h-9 w-9 shrink-0 ${isListening ? "bg-red-500/20 text-red-500 border-red-500/30 animate-pulse" : "border-border"}`}>
            {isListening ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type or talk..." onKeyDown={e => e.key === 'Enter' && handleSend()} className="bg-secondary border-border h-9 text-sm" />
          <Button onClick={() => handleSend()} disabled={isLoading} className="glow-cyan h-9 w-9 p-0"><Send className="h-4 w-4" /></Button>
          {isSpeaking && <div className="absolute right-6 bottom-20 bg-primary/20 p-2 rounded-full border border-primary/30 animate-bounce"><Volume2 className="h-4 w-4 text-primary" /></div>}
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
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [voice, setVoice] = useState("eleven-sarah");
  const [logicProvider, setLogicProvider] = useState("default");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);

  const speakText = async (text: string, voiceId: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    setActiveVoiceId(voiceId);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-tts', {
        body: { text, voiceId }
      });
      if (error) throw error;
      
      const audioUrl = URL.createObjectURL(data);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsSpeaking(false);
        setActiveVoiceId(null);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (err) {
      console.error("Speech error:", err);
      setIsSpeaking(false);
      setActiveVoiceId(null);
      toast.error("Voice preview failed. Ensure ElevenLabs is configured.");
    }
  };
  
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
        <div className="flex items-center gap-1 mb-4">{WIZARD_STEPS.map((s, i) => (<div key={s} className={`h-1.5 rounded-full flex-1 transition-colors ${i <= step ? "bg-primary shadow-[0_0_8px_rgba(0,255,255,0.3)]" : "bg-border"}`} />))}</div>
        
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Agent Name</Label><Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="LeadGen Pro" className="bg-secondary/50 border-border" /></div>
            <div className="space-y-2"><Label>Industry</Label><Select value={industry} onValueChange={setIndustry}><SelectTrigger className="bg-secondary/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Call Script</Label>
            <div className="relative">
              <Textarea 
                value={script} 
                onChange={e => setScript(e.target.value)} 
                rows={8} 
                className="bg-secondary/50 border-border pr-12" 
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-8 w-8 text-primary hover:bg-primary/10"
                onClick={async () => {
                  if (!industry) {
                    toast.error("Please select an industry first");
                    return;
                  }
                  setIsGeneratingScript(true);
                  try {
                    const prompt = `Generate a professional cold call script for a ${industry} agent. The script should:
- Be friendly and professional
- Include a clear value proposition
- Have a natural objection handling section
- End with a clear call to action
- Use {{agent_name}} as a placeholder for the agent's name
- Keep it under 400 words`;
                    
                    const { data, error } = await supabase.functions.invoke('plugin-setup-chat', {
                      body: {
                        messages: [{ role: 'user', content: prompt }],
                        pluginId: 'script-generator'
                      }
                    });

                    if (error) throw error;
                    
                    const generated = data?.output || data?.message || data;
                    if (generated) {
                      setScript(generated);
                      toast.success("Script generated!");
                    } else {
                      throw new Error("No response from AI");
                    }
                  } catch (err: any) {
                    console.error(err);
                    toast.error("Failed to generate. Try again.");
                  } finally {
                    setIsGeneratingScript(false);
                  }
                }}
                disabled={isGeneratingScript}
              >
                {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Tip: Use {'{{agent_name}}'} as a placeholder for the agent's name.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary" /> Select Logic Provider</Label>
              <Select value={logicProvider} onValueChange={setLogicProvider}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue placeholder="Default AI" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Callixis AI</SelectItem>
                  {activePlugins.map(p => (
                    <SelectItem key={p.plugin_id} value={p.plugin_id} className="text-primary font-medium font-mono uppercase tracking-tight">
                      {p.plugin_id === 'n8n' ? "n8n Automation (Connected)" : p.plugin_id}
                    </SelectItem>
                  ))}
                  <SelectItem value="vapi">Vapi AI (Direct)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Voice Preference</Label>
              <ScrollArea className="h-[200px] rounded-md border border-border p-2 bg-secondary/30">
                <div className="grid grid-cols-1 gap-2">
                  {VOICE_REGISTRY.map(v => (
                    <button key={v.id} onClick={() => setVoice(v.id)} className={`p-3 rounded-lg border text-sm text-left transition-all flex items-center justify-between ${voice === v.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{v.flag}</span>
                        <div>
                          <p className="font-bold">{v.name} <span className="text-[10px] text-muted-foreground uppercase ml-1">({v.provider})</span></p>
                          <p className="text-[10px] text-muted-foreground">{v.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isSpeaking && activeVoiceId !== v.voiceId}
                          className={`h-8 w-8 text-primary hover:bg-primary/10 ${activeVoiceId === v.voiceId ? "animate-pulse" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const sampleText = v.language === 'es' ? "Hola, soy una de las voces de Callixis." : "Hi, I'm one of the Callixis voices.";
                            speakText(sampleText, v.voiceId);
                          }}
                        >
                          {activeVoiceId === v.voiceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                        {voice === v.id && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 bg-secondary/30 p-4 rounded-lg border border-border">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Agent:</span><span className="font-bold">{agentName}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Logic Provider:</span><span className="text-primary font-bold uppercase">{logicProvider}</span></div>
          </div>
        )}

        <div className="flex justify-between mt-8 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step > 0 ? "Back" : "Cancel"}</Button>
          {step < maxStep ? <Button onClick={() => setStep(step + 1)} disabled={!canNext()} className="glow-cyan">Next Step</Button> : <Button onClick={async () => {
            if (!user) return;
            try {
              const { error } = await supabase.from("ai_agents").insert({
                user_id: user.id,
                name: agentName,
                industry: industry,
                script: script,
                logic_provider: logicProvider,
                voice: voice,
                voice_settings: {
                  provider: VOICE_REGISTRY.find(v => v.id === voice)?.provider,
                  voiceId: VOICE_REGISTRY.find(v => v.id === voice)?.voiceId,
                }
              });
              if (error) throw error;
              toast.success("Agent deployed!");
              onClose();
            } catch (err: any) { toast.error(err.message); }
          }} className="glow-cyan">Deploy Agent</Button>}
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
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("ai_agents").select("*").eq("user_id", user.id).order('created_at', { ascending: false });
      if (!error && data) {
        setAgents(data);
      }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => {
    const loadPlugins = async () => {
      if (!user) return;
      const { data } = await supabase.from("user_plugins").select("plugin_id, status").eq("user_id", user.id).eq("status", "active");
      if (data) setActivePlugins(data);
    };
    loadPlugins();
    loadAgents();
  }, [user, loadAgents]);

  const displayedAgents = agents.length > 0 ? agents : initialAgents;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-display text-foreground font-bold tracking-tight">AI Agents</h1><p className="text-sm text-muted-foreground mt-1 text-glow-none">Connect your plugins to your agents.</p></div>
        <Button className="glow-cyan h-10 px-5 font-bold" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Deploy Agent</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayedAgents.map((agent) => (
          <Card key={agent.id} className="bg-card border-border p-5 group hover:border-primary/30 transition-all shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors"><Bot className="h-5 w-5 text-primary" /></div>
                <div><h3 className="text-sm font-bold text-foreground">{agent.name}</h3><p className="text-xs text-muted-foreground">{agent.industry}</p></div>
              </div>
              <Badge variant="outline" className={`${statusStyles[agent.status] || statusStyles.Idle} border-none font-bold uppercase text-[9px]`}>{agent.status}</Badge>
            </div>
            <div className="mt-6 pt-4 border-t border-border/50 flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={() => setTestAgent(agent)} className="h-8 text-[10px] gap-1 font-bold border-primary/20 text-primary hover:bg-primary/5 uppercase tracking-wider"><MessageSquare className="h-3 w-3" /> Chat Test</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"><Play className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
      <AgentWizard open={wizardOpen} onClose={() => { setWizardOpen(false); loadAgents(); }} activePlugins={activePlugins} />
      {testAgent && <TestChatDialog agent={testAgent} open={!!testAgent} onClose={() => setTestAgent(null)} />}
    </div>
  );
};

export default AIAgents;
