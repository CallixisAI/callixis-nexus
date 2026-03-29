import { useState, useEffect } from "react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import {
  Phone,
  Users,
  TrendingUp,
  DollarSign,
  Bot,
  Clock,
  Zap,
  Globe,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Brain,
  Signal,
  Cpu,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ── data ───────────────────────────────────────────────
// Removing hardcoded data to use data from useDashboardStats()

const iconMap: Record<string, React.ElementType> = {
  TrendingUp,
  Phone,
  Zap,
  Users,
  Bot,
  Globe,
  DollarSign
};

const activityTypeColor = {
  success: "text-primary",
  info: "text-chart-2",
  neutral: "text-muted-foreground",
};

// ── animated counter hook ──────────────────────────────
function useAnimatedNumber(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

// ── Stat card with animation ───────────────────────────
function AnimatedStatCard({
  title,
  value,
  suffix = "",
  prefix = "",
  change,
  changeType,
  icon: Icon,
  delay = 0,
  glowing = false,
}: {
  title: string;
  value: number;
  suffix?: string;
  prefix?: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  icon: React.ElementType;
  delay?: number;
  glowing?: boolean;
}) {
  const animated = useAnimatedNumber(value);
  const changeColor = changeType === "up" ? "text-primary" : changeType === "down" ? "text-destructive" : "text-muted-foreground";
  const ChangeIcon = changeType === "up" ? ArrowUpRight : changeType === "down" ? ArrowDownRight : Activity;

  return (
    <div
      className={`group relative bg-card rounded-xl border border-border p-5 transition-all duration-300 hover:border-primary/30 overflow-hidden opacity-0 animate-fade-in-up ${glowing ? "glow-cyan-strong" : ""}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      {/* Subtle grid background */}
      <div className="absolute inset-0 neural-grid opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="text-3xl font-bold text-foreground font-body tracking-tight">
          {prefix}{animated.toLocaleString()}{suffix}
        </div>
        <div className={`flex items-center gap-1 mt-2 text-xs ${changeColor}`}>
          <ChangeIcon className="h-3 w-3" />
          <span>{change}</span>
        </div>
      </div>
    </div>
  );
}

// ── Radial gauge ───────────────────────────────────────
function AIHealthGauge() {
  const data = [{ name: "health", value: 97, fill: "hsl(170, 100%, 45%)" }];
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-[140px] h-[140px]">
        <RadialBarChart
          width={140}
          height={140}
          cx={70}
          cy={70}
          innerRadius={50}
          outerRadius={65}
          data={data}
          startAngle={90}
          endAngle={-270}
          barSize={10}
        >
          <RadialBar dataKey="value" cornerRadius={5} background={{ fill: "hsl(220, 14%, 16%)" }} />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Cpu className="h-4 w-4 text-primary mb-1 animate-pulse-glow" />
          <span className="text-2xl font-bold text-foreground">97%</span>
          <span className="text-[10px] text-muted-foreground">AI Health</span>
        </div>
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────
const Dashboard = () => {
  const { data, isLoading } = useDashboardStats();
  const [timeframe, setTimeframe] = useState<TimeframePreset>("7d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [gmtTime, setGmtTime] = useState("");

  useEffect(() => {
    const tick = () => {
      setGmtTime(
        new Date().toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })
      );
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  if (isLoading || !data) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading real-time metrics...</div>;
  }

  const { stats, callData, agentPerformance, channelData, liveAgents, recentActivity } = data;

  const tooltipStyle = {
    backgroundColor: "hsl(220, 18%, 10%)",
    border: "1px solid hsl(220, 14%, 18%)",
    borderRadius: "10px",
    color: "hsl(210, 20%, 92%)",
    fontSize: "12px",
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
        {/* Background effects */}
        <div className="absolute inset-0 neural-grid opacity-40" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-chart-2/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-[10px] font-medium text-primary uppercase tracking-widest">System Online</span>
              </div>
              <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
                GMT 0 · {gmtTime}
              </Badge>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground font-body tracking-tight">
              Welcome back<span className="text-gradient-cyan">,</span>
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm max-w-md">
              Your AI workforce is performing above targets. <span className="text-primary font-medium">{stats.aiAgentsCount} agents</span> are actively generating leads across <span className="text-primary font-medium">{agentPerformance.length} industries</span>.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <AIHealthGauge />
            <div className="hidden sm:flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Signal className="h-3 w-3 text-primary" />
                <span>Latency: <span className="text-foreground font-medium">1.8s avg</span></span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Brain className="h-3 w-3 text-primary" />
                <span>Models: <span className="text-foreground font-medium">3 active</span></span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Accuracy: <span className="text-foreground font-medium">94.7%</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-5">
          <TimeframeFilter
            value={timeframe}
            onChange={setTimeframe}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        </div>
      </div>

      {/* ── KPI Stats ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <AnimatedStatCard title="Total Calls" value={stats.totalCalls} change="+12.5% from last week" changeType="up" icon={Phone} delay={100} />
        <AnimatedStatCard title="Active Leads" value={stats.activeLeads} change="+8.2% from last week" changeType="up" icon={Users} delay={200} />
        <AnimatedStatCard title="Conversion" value={stats.conversion} suffix="%" change="+2.1% from last week" changeType="up" icon={TrendingUp} delay={300} />
        <AnimatedStatCard title="Revenue" value={Math.round(stats.revenue / 1000)} prefix="$" suffix="K" change="+18.3% from last week" changeType="up" icon={DollarSign} delay={400} glowing />
        <AnimatedStatCard title="AI Agents" value={stats.aiAgentsCount} change="3 deploying" changeType="neutral" icon={Bot} delay={500} />
        <AnimatedStatCard title="Avg Response" value={stats.avgResponseTime} suffix="s" change="-0.3s improvement" changeType="up" icon={Clock} delay={600} />
      </div>

      {/* ── Charts Row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main chart — spans 2 cols */}
        <Card className="lg:col-span-2 bg-card border-border p-5 opacity-0 animate-fade-in-up" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Call Volume & Conversions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Real-time AI agent performance</p>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">Live</Badge>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={callData}>
              <defs>
                <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(170, 100%, 45%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(170, 100%, 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 14%)" />
              <XAxis dataKey="name" stroke="hsl(215, 12%, 40%)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(215, 12%, 40%)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="calls" stroke="hsl(170, 100%, 45%)" fill="url(#callGrad)" strokeWidth={2.5} dot={false} />
              <Area type="monotone" dataKey="conversions" stroke="hsl(200, 80%, 55%)" fill="url(#convGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Channel distribution */}
        <Card className="bg-card border-border p-5 opacity-0 animate-fade-in-up" style={{ animationDelay: "450ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-1">Channel Distribution</h3>
          <p className="text-xs text-muted-foreground mb-3">Leads by communication channel</p>
          <div className="flex justify-center">
            <PieChart width={180} height={180}>
              <Pie data={channelData} cx={90} cy={90} innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {channelData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {channelData.map((ch) => (
              <div key={ch.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ch.fill }} />
                <span className="text-muted-foreground">{ch.name}</span>
                <span className="text-foreground font-medium ml-auto">{ch.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Agent Performance + Live Feed ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Performance by industry */}
        <Card className="lg:col-span-3 bg-card border-border p-5 opacity-0 animate-fade-in-up" style={{ animationDelay: "500ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-4">AI Agent Performance by Industry</h3>
          <div className="space-y-4">
            {agentPerformance.map((ind, i) => (
              <div key={ind.name} className="opacity-0 animate-slide-in-right" style={{ animationDelay: `${600 + i * 80}ms`, animationFillMode: "forwards" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{ind.name}</span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">{ind.active} agents</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{ind.leads} leads</span>
                    <span className="text-primary font-semibold">{ind.conversion}%</span>
                  </div>
                </div>
                <Progress value={ind.conversion * 4.5} className="h-1.5 bg-secondary" />
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={agentPerformance} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 14%)" />
                <XAxis dataKey="name" stroke="hsl(215, 12%, 40%)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(215, 12%, 40%)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="leads" fill="hsl(170, 100%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="active" fill="hsl(200, 80%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Live Agent Feed */}
        <Card className="lg:col-span-2 bg-card border-border p-5 opacity-0 animate-fade-in-up" style={{ animationDelay: "600ms", animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Live Agent Feed</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Real-time agent status</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-[10px] text-primary font-medium">LIVE</span>
            </div>
          </div>

          <div className="space-y-3">
            {liveAgents.map((agent, i) => {
              const statusColor = agent.status === "on-call" ? "bg-primary" : agent.status === "processing" ? "bg-chart-4" : "bg-muted-foreground";
              const statusLabel = agent.status === "on-call" ? "On Call" : agent.status === "processing" ? "Processing" : "Idle";

              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors opacity-0 animate-slide-in-right"
                  style={{ animationDelay: `${700 + i * 100}ms`, animationFillMode: "forwards" }}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{agent.name}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                      <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 truncate">
                      <span>{agent.geo}</span>
                      <span>·</span>
                      <span className="truncate">{agent.campaign}</span>
                      {agent.duration !== "—" && (
                        <>
                          <span>·</span>
                          <span className="text-primary font-mono">{agent.duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Button variant="ghost" size="sm" className="w-full mt-3 text-xs text-muted-foreground gap-1 hover:text-primary">
            View Call Center <ChevronRight className="h-3 w-3" />
          </Button>
        </Card>
      </div>

      {/* ── Recent Activity ────────────────────────────── */}
      <Card className="bg-card border-border p-5 opacity-0 animate-fade-in-up" style={{ animationDelay: "700ms", animationFillMode: "forwards" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Activity Stream</h3>
            <p className="text-xs text-muted-foreground mt-0.5">AI system events & milestones</p>
          </div>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Auto-updating</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recentActivity.length === 0 && (
            <div className="col-span-2 text-sm text-muted-foreground py-4">No recent activity found.</div>
          )}
          {recentActivity.map((item, i) => {
            const Icon = iconMap[item.icon] || Activity;
            return (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/10 hover:bg-muted/20 transition-colors opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${800 + i * 80}ms`, animationFillMode: "forwards" }}
              >
                <div className={`w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4 w-4 ${activityTypeColor[item.type]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{item.action}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.time}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
