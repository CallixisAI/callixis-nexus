import { useState, useRef, useEffect, useCallback } from "react";
import {
  Headphones, PhoneCall, Clock, Volume2, VolumeX, Send,
  MapPin, User, Bot, Radio, MessageSquare, X, Minimize2, Maximize2,
  Play, Pause, SkipBack, SkipForward, Download, History, Phone,
  CheckCircle, XCircle, PhoneOff, Star, ArrowRightLeft, FileText,
  Activity, Eye, Zap, Bell, AlertTriangle, PhoneIncoming, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

/* ───────── DATA ───────── */

const queues = [
  { name: "Sales", agents: 12, activeCalls: 8, waiting: 3, avgWait: "12s" },
  { name: "Customer Service", agents: 8, activeCalls: 6, waiting: 1, avgWait: "8s" },
  { name: "Support", agents: 6, activeCalls: 4, waiting: 0, avgWait: "5s" },
  { name: "Billing", agents: 4, activeCalls: 3, waiting: 2, avgWait: "18s" },
];

interface LiveCall {
  id: string;
  agentName: string;
  leadId: string;
  leadName: string;
  geo: string;
  geoFlag: string;
  campaign: string;
  duration: string;
  status: "active" | "ringing" | "hold";
  queue: string;
}

const liveCalls: LiveCall[] = [
  { id: "LC-001", agentName: "Agent Nova", leadId: "LD-4821", leadName: "James Carter", geo: "New York, US", geoFlag: "🇺🇸", campaign: "Home Refi Q1", duration: "02:34", status: "active", queue: "Sales" },
  { id: "LC-002", agentName: "Agent Orion", leadId: "LD-4822", leadName: "Maria Lopez", geo: "Miami, US", geoFlag: "🇺🇸", campaign: "Auto Insurance", duration: "01:12", status: "active", queue: "Sales" },
  { id: "LC-003", agentName: "Agent Vega", leadId: "LD-4823", leadName: "Ahmed Hassan", geo: "London, UK", geoFlag: "🇬🇧", campaign: "Life Insurance EU", duration: "03:45", status: "active", queue: "Customer Service" },
  { id: "LC-004", agentName: "Agent Lyra", leadId: "LD-4824", leadName: "Sophie Chen", geo: "Toronto, CA", geoFlag: "🇨🇦", campaign: "Medical Plan", duration: "00:48", status: "ringing", queue: "Support" },
  { id: "LC-005", agentName: "Agent Pulse", leadId: "LD-4825", leadName: "David Kim", geo: "Los Angeles, US", geoFlag: "🇺🇸", campaign: "Home Improvement", duration: "04:11", status: "active", queue: "Sales" },
  { id: "LC-006", agentName: "Agent Zenith", leadId: "LD-4826", leadName: "Elena Petrov", geo: "Berlin, DE", geoFlag: "🇩🇪", campaign: "Car Sales EU", duration: "01:55", status: "hold", queue: "Billing" },
];

interface CompletedCall {
  id: string;
  agentName: string;
  leadId: string;
  leadName: string;
  geo: string;
  geoFlag: string;
  campaign: string;
  duration: string;
  date: string;
  outcome: "converted" | "callback" | "no-answer" | "rejected";
  queue: string;
  rating: number;
  transcript: { time: string; speaker: "agent" | "lead"; text: string }[];
}

const sampleTranscript = (agentName: string, leadName: string): CompletedCall["transcript"] => [
  { time: "00:00", speaker: "agent", text: `Hello, this is ${agentName} calling from Callixis. Am I speaking with ${leadName}?` },
  { time: "00:05", speaker: "lead", text: "Yes, that's me. What's this about?" },
  { time: "00:10", speaker: "agent", text: "Great! I'm reaching out regarding an exclusive offer we have that could save you significant money. Do you have a moment?" },
  { time: "00:18", speaker: "lead", text: "Sure, I have a few minutes. Go ahead." },
  { time: "00:22", speaker: "agent", text: "Wonderful. Based on your profile, you may qualify for our premium plan with rates starting as low as 3.2%. Have you explored refinancing options recently?" },
  { time: "00:35", speaker: "lead", text: "I've been thinking about it actually. What would the process look like?" },
  { time: "00:42", speaker: "agent", text: "It's very straightforward. I can connect you with a specialist who will walk you through everything. They'll need just a few details from you." },
  { time: "00:55", speaker: "lead", text: "That sounds reasonable. What details do you need?" },
  { time: "01:02", speaker: "agent", text: "Just your current rate, approximate property value, and a good time for our specialist to call you back. Would tomorrow morning work?" },
  { time: "01:15", speaker: "lead", text: "Tomorrow afternoon would be better, around 2 PM." },
  { time: "01:20", speaker: "agent", text: "Perfect, I've scheduled that for you. You'll receive a confirmation shortly. Is there anything else I can help with?" },
  { time: "01:28", speaker: "lead", text: "No, that's all. Thanks for the call." },
  { time: "01:32", speaker: "agent", text: "Thank you for your time! Have a great day." },
];

const completedCalls: CompletedCall[] = [
  { id: "RC-101", agentName: "Agent Nova", leadId: "LD-4801", leadName: "Robert Williams", geo: "Chicago, US", geoFlag: "🇺🇸", campaign: "Home Refi Q1", duration: "05:23", date: "2026-03-25 14:32", outcome: "converted", queue: "Sales", rating: 5, transcript: sampleTranscript("Agent Nova", "Robert Williams") },
  { id: "RC-102", agentName: "Agent Orion", leadId: "LD-4802", leadName: "Lisa Johnson", geo: "Dallas, US", geoFlag: "🇺🇸", campaign: "Auto Insurance", duration: "03:11", date: "2026-03-25 14:18", outcome: "callback", queue: "Sales", rating: 4, transcript: sampleTranscript("Agent Orion", "Lisa Johnson") },
  { id: "RC-103", agentName: "Agent Vega", leadId: "LD-4803", leadName: "Thomas Brown", geo: "Manchester, UK", geoFlag: "🇬🇧", campaign: "Life Insurance EU", duration: "01:45", date: "2026-03-25 13:55", outcome: "no-answer", queue: "Customer Service", rating: 3, transcript: sampleTranscript("Agent Vega", "Thomas Brown") },
  { id: "RC-104", agentName: "Agent Lyra", leadId: "LD-4804", leadName: "Anna Schmidt", geo: "Munich, DE", geoFlag: "🇩🇪", campaign: "Medical Plan", duration: "07:02", date: "2026-03-25 13:40", outcome: "converted", queue: "Support", rating: 5, transcript: sampleTranscript("Agent Lyra", "Anna Schmidt") },
  { id: "RC-105", agentName: "Agent Pulse", leadId: "LD-4805", leadName: "Kevin Park", geo: "Seoul, KR", geoFlag: "🇰🇷", campaign: "Home Improvement", duration: "02:38", date: "2026-03-25 13:22", outcome: "rejected", queue: "Sales", rating: 2, transcript: sampleTranscript("Agent Pulse", "Kevin Park") },
  { id: "RC-106", agentName: "Agent Zenith", leadId: "LD-4806", leadName: "Claire Dubois", geo: "Paris, FR", geoFlag: "🇫🇷", campaign: "Car Sales EU", duration: "04:50", date: "2026-03-25 12:58", outcome: "converted", queue: "Billing", rating: 4, transcript: sampleTranscript("Agent Zenith", "Claire Dubois") },
  { id: "RC-107", agentName: "Agent Nova", leadId: "LD-4807", leadName: "Mike Turner", geo: "Boston, US", geoFlag: "🇺🇸", campaign: "Home Refi Q1", duration: "06:15", date: "2026-03-25 12:30", outcome: "callback", queue: "Sales", rating: 4, transcript: sampleTranscript("Agent Nova", "Mike Turner") },
  { id: "RC-108", agentName: "Agent Orion", leadId: "LD-4808", leadName: "Yuki Tanaka", geo: "Tokyo, JP", geoFlag: "🇯🇵", campaign: "Auto Insurance", duration: "03:44", date: "2026-03-25 12:10", outcome: "converted", queue: "Sales", rating: 5, transcript: sampleTranscript("Agent Orion", "Yuki Tanaka") },
];

interface WhisperMessage {
  role: "user" | "system";
  text: string;
}

/* ───────── STAT PILL ───────── */

function StatPill({ icon: Icon, value, label, accent = false }: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${
      accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"
    }`}>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
        accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

/* ───────── QUICK ACTION BAR (inline on each live row) ───────── */

function LiveCallRow({ call, onSelect, isSelected }: {
  call: LiveCall;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const statusDot =
    call.status === "active" ? "bg-green-500" :
    call.status === "ringing" ? "bg-yellow-500" : "bg-orange-500";

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-all border ${
        isSelected
          ? "border-primary/40 bg-primary/5 shadow-[0_0_15px_-5px_hsl(var(--primary)/0.25)]"
          : "border-transparent hover:border-border hover:bg-card/60"
      }`}
      onClick={() => onSelect(call.id)}
    >
      {/* Status dot */}
      <div className="relative">
        <div className={`h-2 w-2 rounded-full ${statusDot}`} />
        {call.status === "active" && (
          <div className={`absolute inset-0 h-2 w-2 rounded-full ${statusDot} animate-ping opacity-40`} />
        )}
      </div>

      {/* Agent */}
      <div className="flex items-center gap-2 w-32 shrink-0">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium text-foreground truncate">{call.agentName}</span>
      </div>

      {/* Lead */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground truncate">{call.leadName}</span>
          <span className="text-[10px] font-mono text-muted-foreground">{call.leadId}</span>
        </div>
      </div>

      {/* Geo */}
      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground w-36 shrink-0">
        <span>{call.geoFlag}</span>
        <span className="truncate">{call.geo}</span>
      </div>

      {/* Campaign */}
      <div className="hidden lg:block text-xs text-muted-foreground w-32 shrink-0 truncate">
        {call.campaign}
      </div>

      {/* Duration */}
      <Badge variant="outline" className="font-mono text-[10px] shrink-0">
        {call.duration}
      </Badge>

      {/* Status badge */}
      <Badge
        className={`text-[10px] capitalize shrink-0 ${
          call.status === "active" ? "bg-green-500/10 text-green-500 border-green-500/20" :
          call.status === "ringing" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
          "bg-orange-500/10 text-orange-500 border-orange-500/20"
        }`}
        variant="outline"
      >
        {call.status}
      </Badge>

      {/* Quick view icon */}
      <Eye className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
    </div>
  );
}

/* ───────── EXPANDED CALL PANEL ───────── */

function ExpandedCallPanel({ call }: { call: LiveCall }) {
  const [listening, setListening] = useState(false);
  const [whisperOpen, setWhisperOpen] = useState(true);
  const [whisperInput, setWhisperInput] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [whisperMessages, setWhisperMessages] = useState<WhisperMessage[]>([
    { role: "system", text: `Connected to ${call.agentName}'s call. Type a whisper to guide the agent in real-time.` },
  ]);

  const toggleListen = () => {
    setListening(!listening);
    toast.success(listening ? "Stopped listening" : `🎧 Listening to ${call.agentName}...`);
  };

  const sendWhisper = () => {
    if (!whisperInput.trim()) return;
    setWhisperMessages((prev) => [
      ...prev,
      { role: "user", text: whisperInput },
      { role: "system", text: `✓ Whisper delivered to ${call.agentName}.` },
    ]);
    setWhisperInput("");
  };

  const handleTransfer = () => {
    setTransferring(true);
    setTimeout(() => {
      setTransferring(false);
      setTransferOpen(false);
      toast.success(`Call transferred! You are now connected to ${call.leadName}.`);
    }, 2000);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-card overflow-hidden shadow-lg shadow-primary/5 animate-in slide-in-from-top-2 duration-200">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">{call.agentName}</span>
            <span className="text-xs text-muted-foreground ml-2">→ {call.leadName}</span>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">{call.duration}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={listening ? "destructive" : "default"}
            className="h-8 text-xs gap-1.5"
            onClick={toggleListen}
          >
            {listening ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {listening ? "Stop Listening" : "Listen Live"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 border-primary/20 text-primary hover:bg-primary/10"
            onClick={() => setTransferOpen(true)}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Transfer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left: Call info + visual */}
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lead</p>
              <p className="text-sm font-medium text-foreground">{call.leadName}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{call.leadId}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Location</p>
              <p className="text-sm font-medium text-foreground">{call.geoFlag} {call.geo}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Campaign</p>
              <p className="text-sm font-medium text-foreground">{call.campaign}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Queue</p>
              <p className="text-sm font-medium text-foreground">{call.queue}</p>
            </div>
          </div>

          {/* Live audio visualizer (decorative) */}
          {listening && (
            <div className="rounded-lg bg-muted/30 border border-border p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Live Audio</span>
              </div>
              <div className="flex items-end gap-[2px] h-8">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-primary/60 rounded-sm transition-all"
                    style={{
                      height: `${20 + Math.sin(Date.now() / 200 + i * 0.5) * 30 + Math.random() * 50}%`,
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Whisper chat */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/10">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Whisper to Agent</span>
            <span className="text-[10px] text-muted-foreground">— only {call.agentName} can see this</span>
          </div>
          <ScrollArea className="flex-1 h-[180px]">
            <div className="p-3 space-y-2">
              {whisperMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-xs px-3 py-2 rounded-lg max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary/10 text-primary ml-auto"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex gap-2 p-3 border-t border-border bg-muted/5">
            <Input
              value={whisperInput}
              onChange={(e) => setWhisperInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendWhisper()}
              placeholder="Type a whisper… (e.g. Ask about their budget)"
              className="h-8 text-xs bg-background"
            />
            <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendWhisper} disabled={!whisperInput.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Lead</DialogTitle>
            <DialogDescription>
              Take over this call from <strong>{call.agentName}</strong>. The AI agent will disconnect and you'll speak directly to <strong>{call.leadName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 text-sm">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Lead</p>
              <p className="font-medium text-foreground">{call.leadName}</p>
              <p className="text-xs text-muted-foreground font-mono">{call.leadId}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Location</p>
              <p className="font-medium text-foreground">{call.geoFlag} {call.geo}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferring}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={transferring}>
              {transferring ? (
                <><span className="h-3 w-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />Connecting...</>
              ) : (
                <><ArrowRightLeft className="h-4 w-4 mr-2" />Transfer to Me</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────── RECORDING PLAYER ───────── */

function RecordingPlayer({ call, onClose }: { call: CompletedCall; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const durationSec = (() => {
    const [m, s] = call.duration.split(":").map(Number);
    return m * 60 + s;
  })();

  const togglePlay = () => {
    if (playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      intervalRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setPlaying(false);
            return 100;
          }
          return p + (100 / durationSec) * playbackSpeed;
        });
      }, 1000);
    }
  };

  const skip = (delta: number) => setProgress((p) => Math.max(0, Math.min(100, p + (delta / durationSec) * 100)));
  const elapsed = Math.floor((progress / 100) * durationSec);
  const elapsedStr = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const outcomeIcon =
    call.outcome === "converted" ? <CheckCircle className="h-4 w-4 text-green-500" /> :
    call.outcome === "callback" ? <Phone className="h-4 w-4 text-primary" /> :
    call.outcome === "no-answer" ? <PhoneOff className="h-4 w-4 text-muted-foreground" /> :
    <XCircle className="h-4 w-4 text-destructive" />;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{call.agentName}</span>
          <span className="text-[10px] text-muted-foreground">{call.date}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Player */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="h-3 w-3" /><span>{call.leadName}</span>
              <span className="font-mono text-[10px]">({call.leadId})</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3 w-3" /><span>{call.geoFlag} {call.geo}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Radio className="h-3 w-3" /><span>{call.campaign}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {outcomeIcon}
              <span className="capitalize text-muted-foreground">{call.outcome}</span>
              <span className="flex items-center gap-0.5 ml-auto">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-3 w-3 ${i < call.rating ? "text-yellow-400 fill-yellow-400" : "text-muted"}`} />
                ))}
              </span>
            </div>
          </div>

          {/* Waveform */}
          <div className="space-y-1">
            <div
              className="h-10 bg-muted rounded-lg relative overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setProgress(((e.clientX - rect.left) / rect.width) * 100);
              }}
            >
              <div className="absolute inset-0 flex items-center gap-[2px] px-1">
                {Array.from({ length: 80 }).map((_, i) => {
                  const h = 15 + Math.sin(i * 0.7) * 12 + Math.cos(i * 1.3) * 8;
                  const filled = (i / 80) * 100 <= progress;
                  return (
                    <div key={i} className={`flex-1 rounded-sm transition-colors ${filled ? "bg-primary" : "bg-muted-foreground/20"}`} style={{ height: `${h}%` }} />
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>{elapsedStr}</span><span>{call.duration}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => skip(-10)}><SkipBack className="h-4 w-4" /></Button>
            <Button size="icon" variant="default" className="h-10 w-10 rounded-full" onClick={togglePlay}>
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => skip(10)}><SkipForward className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px] ml-2" onClick={() => setPlaybackSpeed((s) => (s >= 2 ? 0.5 : s + 0.5))}>{playbackSpeed}x</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 ml-auto" onClick={() => toast.success("Download started")}><Download className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Transcript */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/10">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Call Transcript</span>
            <Badge variant="outline" className="text-[10px] ml-auto">{call.transcript.length} messages</Badge>
          </div>
          <ScrollArea className="h-[220px]">
            <div className="p-3 space-y-2.5">
              {call.transcript.map((line, i) => (
                <div key={i} className={`flex gap-2 ${line.speaker === "agent" ? "" : "flex-row-reverse"}`}>
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                    line.speaker === "agent" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {line.speaker === "agent" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  </div>
                  <div className={`max-w-[80%] space-y-0.5 ${line.speaker === "lead" ? "text-right" : ""}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-foreground">
                        {line.speaker === "agent" ? call.agentName : call.leadName}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-mono">{line.time}</span>
                    </div>
                    <p className={`text-xs leading-relaxed px-2.5 py-1.5 rounded-lg ${
                      line.speaker === "agent" ? "bg-primary/5 text-foreground rounded-tl-none" : "bg-muted text-foreground rounded-tr-none"
                    }`}>{line.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

/* ───────── MAIN PAGE ───────── */

/* ───────── NOTIFICATION TYPES ───────── */

interface Notification {
  id: string;
  type: "incoming_call" | "assistance" | "transfer_complete" | "call_ended" | "queue_alert";
  title: string;
  message: string;
  agentName?: string;
  time: Date;
  read: boolean;
}

const notificationTemplates = [
  { type: "incoming_call" as const, title: "New Incoming Call", messages: [
    "New lead from Google Ads — Home Refi campaign, routed to {agent}",
    "Inbound call from Facebook Lead — Auto Insurance, assigned to {agent}",
    "New call from landing page — Medical Plan campaign, picked up by {agent}",
  ]},
  { type: "assistance" as const, title: "Agent Needs Help", messages: [
    "{agent} is requesting assistance — lead asking about competitor pricing",
    "{agent} flagged a complex objection — lead wants to speak to a manager",
    "{agent} needs guidance — lead is asking about custom payment plans",
  ]},
  { type: "transfer_complete" as const, title: "Transfer Complete", messages: [
    "Call successfully transferred from {agent} to live operator",
    "{agent}'s call was handed off — lead is now speaking with a specialist",
  ]},
  { type: "call_ended" as const, title: "Call Completed", messages: [
    "{agent} just completed a call — outcome: Converted ✓",
    "{agent} finished call with lead — outcome: Callback scheduled",
    "{agent}'s call ended — outcome: No answer",
  ]},
  { type: "queue_alert" as const, title: "Queue Alert", messages: [
    "Sales queue wait time exceeded 30s — 4 calls waiting",
    "Billing queue is backed up — consider adding more agents",
    "Support queue cleared — all calls handled",
  ]},
];

const agentNames = ["Agent Nova", "Agent Orion", "Agent Vega", "Agent Lyra", "Agent Pulse", "Agent Zenith"];

const CallCenter = () => {
  const [filterQueue, setFilterQueue] = useState<string>("all");
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [activeRecording, setActiveRecording] = useState<string | null>(null);
  const [recordingFilter, setRecordingFilter] = useState<string>("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifIdRef = useRef(0);

  const addNotification = useCallback(() => {
    const template = notificationTemplates[Math.floor(Math.random() * notificationTemplates.length)];
    const agent = agentNames[Math.floor(Math.random() * agentNames.length)];
    const msgTemplate = template.messages[Math.floor(Math.random() * template.messages.length)];
    const message = msgTemplate.replace("{agent}", agent);

    const notif: Notification = {
      id: `notif-${++notifIdRef.current}`,
      type: template.type,
      title: template.title,
      message,
      agentName: agent,
      time: new Date(),
      read: false,
    };

    setNotifications((prev) => [notif, ...prev].slice(0, 50));

  }, []);

  // Simulate real-time notifications
  useEffect(() => {
    // Initial burst of 3 notifications
    const initialTimeout = setTimeout(() => {
      addNotification();
      setTimeout(() => addNotification(), 800);
      setTimeout(() => addNotification(), 1600);
    }, 2000);

    // Then periodic notifications every 8–15 seconds
    const interval = setInterval(() => {
      addNotification();
    }, 8000 + Math.random() * 7000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [addNotification]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const getNotifIcon = (type: Notification["type"]) => {
    switch (type) {
      case "incoming_call": return <PhoneIncoming className="h-4 w-4 text-green-500" />;
      case "assistance": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "transfer_complete": return <UserCheck className="h-4 w-4 text-primary" />;
      case "call_ended": return <PhoneOff className="h-4 w-4 text-muted-foreground" />;
      case "queue_alert": return <Activity className="h-4 w-4 text-orange-500" />;
    }
  };

  const getTimeSince = (date: Date) => {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  };

  const filtered = filterQueue === "all" ? liveCalls : liveCalls.filter((c) => c.queue === filterQueue);
  const selectedLiveCall = liveCalls.find((c) => c.id === selectedCall);

  const totalActive = liveCalls.filter(c => c.status === "active").length;
  const totalWaiting = liveCalls.filter(c => c.status === "ringing").length;
  const totalHold = liveCalls.filter(c => c.status === "hold").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">Call Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monitor AI agents in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 relative"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className={`h-4 w-4 ${unreadCount > 0 ? "text-primary" : "text-muted-foreground"}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center animate-in zoom-in-50">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-500">All Systems Online</span>
          </div>
        </div>
      </div>

      {/* Notification panel */}
      {showNotifications && (
        <div className="rounded-xl border border-border bg-card overflow-hidden animate-in slide-in-from-top-2 duration-200 shadow-lg">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[9px] h-4 px-1.5">{unreadCount} new</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-[10px] text-muted-foreground" onClick={markAllRead}>
                  Mark all read
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-[10px] text-muted-foreground" onClick={clearNotifications}>
                Clear
              </Button>
              <button onClick={() => setShowNotifications(false)} className="text-muted-foreground hover:text-foreground ml-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/30 ${
                      !notif.read ? "bg-primary/[0.03]" : ""
                    }`}
                    onClick={() => setNotifications((prev) =>
                      prev.map((n) => n.id === notif.id ? { ...n, read: true } : n)
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{getNotifIcon(notif.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${!notif.read ? "text-foreground" : "text-muted-foreground"}`}>
                          {notif.title}
                        </span>
                        {!notif.read && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{notif.message}</p>
                      <span className="text-[10px] text-muted-foreground/60 mt-1 block">{getTimeSince(notif.time)}</span>
                    </div>
                    {notif.type === "assistance" && !notif.read && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] shrink-0 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10">
                        Assist
                      </Button>
                    )}
                    {notif.type === "incoming_call" && !notif.read && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] shrink-0 border-green-500/30 text-green-500 hover:bg-green-500/10">
                        Monitor
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill icon={PhoneCall} value={totalActive} label="Active Calls" accent />
        <StatPill icon={Clock} value={totalWaiting} label="Ringing" />
        <StatPill icon={Pause} value={totalHold} label="On Hold" />
        <StatPill icon={Headphones} value={30} label="Agents Online" accent />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="live" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="live" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Activity className="h-3.5 w-3.5" />
            Live Monitor
            <Badge variant="destructive" className="text-[9px] h-4 px-1 animate-pulse ml-1">LIVE</Badge>
          </TabsTrigger>
          <TabsTrigger value="recordings" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <History className="h-3.5 w-3.5" />
            Recordings
            <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">{completedCalls.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ─── LIVE TAB ─── */}
        <TabsContent value="live" className="space-y-4 mt-0">
          {/* Queue filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Queue:</span>
            {["all", ...queues.map((q) => q.name)].map((q) => (
              <Button
                key={q}
                size="sm"
                variant={filterQueue === q ? "default" : "ghost"}
                className={`h-7 text-xs capitalize ${filterQueue === q ? "" : "text-muted-foreground"}`}
                onClick={() => setFilterQueue(q)}
              >
                {q}
                {q !== "all" && (
                  <span className="ml-1 text-[10px] opacity-60">
                    ({liveCalls.filter(c => c.queue === q).length})
                  </span>
                )}
              </Button>
            ))}
          </div>

          {/* Live calls list */}
          <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
            <div className="divide-y divide-border/50">
              {filtered.map((call) => (
                <LiveCallRow
                  key={call.id}
                  call={call}
                  onSelect={(id) => setSelectedCall(selectedCall === id ? null : id)}
                  isSelected={selectedCall === call.id}
                />
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">No active calls in this queue</div>
            )}
          </div>

          {/* Expanded panel for selected call */}
          {selectedLiveCall && <ExpandedCallPanel call={selectedLiveCall} />}
        </TabsContent>

        {/* ─── RECORDINGS TAB ─── */}
        <TabsContent value="recordings" className="space-y-4 mt-0">
          {/* Outcome filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Outcome:</span>
            {["all", "converted", "callback", "no-answer", "rejected"].map((o) => (
              <Button
                key={o}
                size="sm"
                variant={recordingFilter === o ? "default" : "ghost"}
                className={`h-7 text-xs capitalize ${recordingFilter === o ? "" : "text-muted-foreground"}`}
                onClick={() => setRecordingFilter(o)}
              >
                {o === "no-answer" ? "No Answer" : o}
              </Button>
            ))}
          </div>

          {/* Active Recording Player */}
          {activeRecording && (() => {
            const call = completedCalls.find((c) => c.id === activeRecording);
            if (!call) return null;
            return <RecordingPlayer call={call} onClose={() => setActiveRecording(null)} />;
          })()}

          {/* Recordings list */}
          <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Agent</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Lead</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 hidden md:table-cell">Geo</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 hidden lg:table-cell">Campaign</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Duration</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Outcome</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 hidden lg:table-cell">Date</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {completedCalls
                  .filter((c) => recordingFilter === "all" || c.outcome === recordingFilter)
                  .map((c) => {
                    const outcomeStyle =
                      c.outcome === "converted" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                      c.outcome === "callback" ? "bg-primary/10 text-primary border-primary/20" :
                      c.outcome === "rejected" ? "bg-destructive/10 text-destructive border-destructive/20" :
                      "bg-muted text-muted-foreground border-border";
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-border/50 last:border-0 cursor-pointer transition-colors hover:bg-muted/30 ${activeRecording === c.id ? "bg-primary/5" : ""}`}
                        onClick={() => setActiveRecording(activeRecording === c.id ? null : c.id)}
                      >
                        <td className="p-3 text-sm text-foreground font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <Bot className="h-3 w-3 text-primary" />
                            </div>
                            <span className="truncate">{c.agentName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          <div className="truncate">{c.leadName}</div>
                          <div className="text-[10px] font-mono">{c.leadId}</div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">{c.geoFlag} {c.geo}</td>
                        <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell truncate">{c.campaign}</td>
                        <td className="p-3 text-sm text-muted-foreground font-mono">{c.duration}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={`text-[10px] capitalize ${outcomeStyle}`}>{c.outcome}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{c.date}</td>
                        <td className="p-3">
                          <Button
                            size="icon"
                            variant={activeRecording === c.id ? "default" : "ghost"}
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); setActiveRecording(activeRecording === c.id ? null : c.id); }}
                          >
                            {activeRecording === c.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CallCenter;
