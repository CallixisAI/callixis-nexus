import { useState, useRef, useCallback, useEffect } from "react";
import { Bot, Plus, Play, Pause, Wand2, FileText, Volume2, Square, MessageSquare, Loader2, BrainCircuit, Send, X, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const statusStyles: Record<string, string> = {
  running: "text-primary bg-primary/10",
  paused: "text-yellow-400 bg-yellow-400/10",
  training: "text-blue-400 bg-blue-400/10",
  idle: "text-muted-foreground bg-secondary/50",
};

const VOICE_REGISTRY = [
  { id: "eleven-sarah", name: "Sarah", provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", language: "en", flag: "🇺🇸", desc: "Warm, professional" },
  { id: "eleven-james", name: "James", provider: "elevenlabs", voiceId: "JBFqnCBsd6RMkjVDRZzb", language: "en", flag: "🇺🇸", desc: "Confident, authoritative" },
  { id: "vapi-aria", name: "Aria", provider: "vapi", voiceId: "aria", language: "en", flag: "🇺🇸", desc: "Fast, conversational" },
  { id: "vapi-roger", name: "Roger", provider: "vapi", voiceId: "roger", language: "en", flag: "🇬🇧", desc: "British, articulate" },
];

const INDUSTRIES = ["Real Estate", "Insurance", "Medical", "Finance", "Car Sales", "Home Improvement", "Other"];

const TestChatDialog = ({ agent, open, onClose }: { agent: any; open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

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
    if (isListening) recognitionRef.current?.stop();
    else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const speakText = async (text: string, overrideVoiceId?: string) => {
    const vId = overrideVoiceId || agent.voice;
    if (!vId || isSpeaking) return;
    setIsSpeaking(true);
    try {
      const response = await supabase.functions.invoke("elevenlabs-tts", { body: { text, voiceId: vId } });
      if (response.error) throw response.error;
      const audioBlob = response.data;
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.play();
    } catch {
      setIsSpeaking(false);
      toast.error("Voice preview failed. Check API key.");
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading || !agent) return;

    const userMsg = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke("n8n-proxy", {
        body: {
          message: textToSend,
          agent_id: agent.id,
          agent_name: agent.name,
          user_id: user?.id,
        },
      });

      if (response.error) throw new Error(response.error.message || "The proxy function returned an error.");
      const data = response.data;
      if (data.error) throw new Error(data.error);

      const reply = data.output || data.message || data.data || "Message received, but no text output found in n8n response.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      speakText(reply);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Connection Error: ${err.message || "Failed to reach the workflow backend."}` }]);
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
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground border border-border"}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-lg px-3 py-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border shrink-0 flex gap-2 items-center">
          <Button onClick={toggleListening} variant="outline" size="icon" className={`h-9 w-9 shrink-0 ${isListening ? "bg-red-500/20 text-red-500 border-red-500/30 animate-pulse" : "border-border"}`}>
            {isListening ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type or talk..." onKeyDown={(event) => event.key === "Enter" && handleSend()} className="bg-secondary border-border h-9 text-sm" />
          <Button onClick={() => handleSend()} disabled={isLoading} className="glow-cyan h-9 w-9 p-0"><Send className="h-4 w-4" /></Button>
          {isSpeaking && <div className="absolute right-6 bottom-20 bg-primary/20 p-2 rounded-full border border-primary/30 animate-bounce"><Volume2 className="h-4 w-4 text-primary" /></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AgentWizard = ({ open, onClose, activePlugins, user }: { open: boolean; onClose: () => void; activePlugins: any[]; user: any }) => {
  const [step, setStep] = useState(0);
  const [isDeploying, setIsDeploying] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [industry, setIndustry] = useState("");
  const [script, setScript] = useState("Hello! My name is {{agent_name}}.");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [voice, setVoice] = useState("eleven-sarah");
  const [logicProvider, setLogicProvider] = useState("default");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);

  const WIZARD_STEPS = ["Basics", "Script", "Brain & Logic", "Review"];
  const maxStep = WIZARD_STEPS.length - 1;

  useEffect(() => {
    if (!open) {
      setStep(0);
      setAgentName("");
      setIndustry("");
      setScript("Hello! My name is {{agent_name}}.");
      setVoice("eleven-sarah");
      setLogicProvider("default");
    }
  }, [open]);

  const selectedVoice = VOICE_REGISTRY.find((entry) => entry.id === voice);

  const canNext = () => {
    if (step === 0) return agentName.trim() && industry;
    if (step === 1) return script.trim().length > 5;
    return true;
  };

  const speakText = async (text: string, voiceId: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    setActiveVoiceId(voiceId);
    try {
      const response = await supabase.functions.invoke("elevenlabs-tts", { body: { text, voiceId } });
      if (response.error) throw response.error;
      const audioBlob = response.data;
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsSpeaking(false);
        setActiveVoiceId(null);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (err: any) {
      setIsSpeaking(false);
      setActiveVoiceId(null);
      toast.error(err.message || "Voice preview failed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2 font-display text-xl"><Wand2 className="h-5 w-5 text-primary" /> Create AI Agent</DialogTitle>
          <DialogDescription>This wizard now only saves fields the database actually supports. Script and logic choices remain planning inputs for now.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-1 mb-4">{WIZARD_STEPS.map((label, index) => <div key={label} className={`h-1.5 rounded-full flex-1 transition-colors ${index <= step ? "bg-primary" : "bg-border"}`} />)}</div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Agent Name</Label><Input value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="LeadGen Pro" className="bg-secondary/50 border-border" /></div>
            <div className="space-y-2"><Label>Industry</Label><Select value={industry} onValueChange={setIndustry}><SelectTrigger className="bg-secondary/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{INDUSTRIES.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent></Select></div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Planning Script</Label>
            <div className="relative">
              <Textarea value={script} onChange={(event) => setScript(event.target.value)} rows={8} className="bg-secondary/50 border-border pr-12" />
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
                    const prompt = `Generate a professional cold call script for a ${industry} agent. Keep it concise, friendly, and use {{agent_name}} as the placeholder.`;
                    const response = await supabase.functions.invoke("n8n-proxy", {
                      body: {
                        message: prompt,
                        agent_id: "script-generator",
                        agent_name: "Genie",
                        user_id: user?.id,
                        context: "Generate Script",
                      },
                    });
                    if (response.error) throw new Error(response.error.message || "Could not reach script generator.");
                    const data = response.data;
                    const generated = data?.output || data?.message || data?.data || data;
                    if (generated && typeof generated === "string") {
                      setScript(generated);
                      toast.success("Script generated");
                    } else {
                      throw new Error("No script text returned by workflow.");
                    }
                  } catch (err: any) {
                    toast.error(`Script generation failed: ${err.message}`);
                  } finally {
                    setIsGeneratingScript(false);
                  }
                }}
                disabled={isGeneratingScript}
              >
                {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">This text is for planning and testing only. It is not saved to the current `ai_agents` table yet.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary" /> Logic Provider</Label>
              <Select value={logicProvider} onValueChange={setLogicProvider}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue placeholder="Default AI" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Callixis AI</SelectItem>
                  {activePlugins.map((plugin) => <SelectItem key={plugin.plugin_id} value={plugin.plugin_id}>{plugin.plugin_id}</SelectItem>)}
                  <SelectItem value="vapi">Vapi AI (Direct)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">This selection is not persisted yet because the current schema does not include a logic provider field.</p>
            </div>

            <div className="space-y-2">
              <Label>Voice Preference</Label>
              <ScrollArea className="h-[200px] rounded-md border border-border p-2 bg-secondary/30">
                <div className="grid grid-cols-1 gap-2">
                  {VOICE_REGISTRY.map((entry) => (
                    <button key={entry.id} onClick={() => setVoice(entry.id)} className={`p-3 rounded-lg border text-sm text-left transition-all flex items-center justify-between ${voice === entry.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{entry.flag}</span>
                        <div>
                          <p className="font-bold">{entry.name} <span className="text-[10px] text-muted-foreground uppercase ml-1">({entry.provider})</span></p>
                          <p className="text-[10px] text-muted-foreground">{entry.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isSpeaking && activeVoiceId !== entry.voiceId}
                          className={`h-8 w-8 text-primary hover:bg-primary/10 ${activeVoiceId === entry.voiceId ? "animate-pulse" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            speakText("Hi, I'm one of the Callixis voices.", entry.voiceId);
                          }}
                        >
                          {activeVoiceId === entry.voiceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                        {voice === entry.id && <Check className="h-4 w-4 text-primary" />}
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
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Agent</span><span className="font-bold">{agentName}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Industry</span><span className="font-bold">{industry}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Saved voice</span><span className="font-bold">{selectedVoice?.voiceId || "nova"}</span></div>
            <div className="rounded-lg bg-card border border-border p-3 text-xs text-muted-foreground leading-relaxed">
              Stored now: name, industry, status, model, and voice.
              Not stored yet: script, logic provider, and rich voice settings.
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step > 0 ? "Back" : "Cancel"}</Button>
          {step < maxStep ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()} className="glow-cyan">Next Step</Button>
          ) : (
            <Button
              disabled={isDeploying}
              onClick={async () => {
                if (!user) {
                  toast.error("No user session found.");
                  return;
                }

                setIsDeploying(true);
                try {
                  const { error } = await supabase.from("ai_agents").insert({
                    user_id: user.id,
                    name: agentName,
                    industry,
                    model: logicProvider === "default" ? "gemini-1.5-pro" : logicProvider,
                    status: "running",
                    voice: selectedVoice?.voiceId || "nova",
                  });

                  if (error) throw error;
                  toast.success("Agent deployed");
                  onClose();
                } catch (err: any) {
                  toast.error(`Deployment failed: ${err.message || "Unknown error"}`);
                } finally {
                  setIsDeploying(false);
                }
              }}
              className="glow-cyan"
            >
              {isDeploying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isDeploying ? "Deploying..." : "Deploy Agent"}
            </Button>
          )}
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
      const { data, error } = await supabase.from("ai_agents").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      setAgents(data || []);
    } catch (err: any) {
      toast.error(`Failed to load agents: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const loadPlugins = async () => {
      if (!user) return;
      try {
        const { data } = await supabase.from("user_plugins").select("plugin_id, status").eq("user_id", user.id).eq("status", "active");
        if (data) setActivePlugins(data);
      } catch {
        // Keep plugin list optional.
      }
    };

    loadPlugins();
    loadAgents();
  }, [user, loadAgents]);

  const displayedAgents = agents.map((agent) => ({
    ...agent,
    displayStatus: agent.status?.toLowerCase() || "idle",
    calls: "Linked to live campaign data",
    successRate: `${Math.max(0, Math.min(100, agent.status === "running" ? 18 : 0))}%`,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground font-bold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Deploy and manage agents backed by the actual `ai_agents` table.</p>
        </div>
        <Button className="glow-cyan h-10 px-5 font-bold" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Deploy Agent</Button>
      </div>

      <Card className="bg-card border-border p-4 text-xs text-muted-foreground leading-relaxed">
        This page now only promises what is real. Agents persist correctly to the database, but advanced script storage, voice settings objects, and logic-provider wiring still need backend/schema work.
      </Card>

      {isLoading && agents.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((index) => (
            <Card key={index} className="bg-card border-border p-5 h-[160px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/20" /></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayedAgents.map((agent) => (
            <Card key={agent.id} className="bg-card border-border p-5 group hover:border-primary/30 transition-all shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors"><Bot className="h-5 w-5 text-primary" /></div>
                  <div>
                    <div className="flex items-center gap-2"><h3 className="text-sm font-bold text-foreground">{agent.name}</h3></div>
                    <p className="text-xs text-muted-foreground">{agent.industry || "No industry set"}</p>
                  </div>
                </div>
                <Badge variant="outline" className={`${statusStyles[agent.displayStatus] || statusStyles.idle} border-none font-bold uppercase text-[9px]`}>{agent.displayStatus}</Badge>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between"><span>Model</span><span className="text-foreground">{agent.model}</span></div>
                <div className="flex items-center justify-between"><span>Voice</span><span className="text-foreground font-mono">{agent.voice}</span></div>
                <div className="flex items-center justify-between"><span>Created</span><span className="text-foreground">{new Date(agent.created_at).toLocaleDateString()}</span></div>
              </div>

              <div className="mt-6 pt-4 border-t border-border/50 flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={() => setTestAgent(agent)} className="h-8 text-[10px] gap-1 font-bold border-primary/20 text-primary hover:bg-primary/5 uppercase tracking-wider"><MessageSquare className="h-3 w-3" /> Chat Test</Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                    onClick={async () => {
                      const nextStatus = agent.displayStatus === "running" ? "paused" : "running";
                      const { error } = await supabase.from("ai_agents").update({ status: nextStatus }).eq("id", agent.id);
                      if (error) toast.error(error.message);
                      else {
                        toast.success(`Agent ${nextStatus}`);
                        loadAgents();
                      }
                    }}
                  >
                    {agent.displayStatus === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={async () => {
                      if (!confirm("Are you sure you want to delete this agent?")) return;
                      try {
                        const { error } = await supabase.from("ai_agents").delete().eq("id", agent.id);
                        if (error) throw error;
                        toast.success("Agent deleted");
                        loadAgents();
                      } catch (err: any) {
                        toast.error(err.message);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {displayedAgents.length === 0 && !isLoading && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-xl">
              <Bot className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">No agents found</h3>
              <p className="text-muted-foreground">Deploy your first AI agent to get started.</p>
            </div>
          )}
        </div>
      )}

      <AgentWizard open={wizardOpen} onClose={() => { setWizardOpen(false); loadAgents(); }} activePlugins={activePlugins} user={user} />
      {testAgent && <TestChatDialog agent={testAgent} open={!!testAgent} onClose={() => setTestAgent(null)} />}
    </div>
  );
};

export default AIAgents;
