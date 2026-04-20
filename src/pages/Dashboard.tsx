import { useEffect, useState } from "react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import {
  Phone,
  Users,
  TrendingUp,
  DollarSign,
  Bot,
  Clock,
  Activity,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "hsl(220, 18%, 10%)",
  border: "1px solid hsl(220, 14%, 18%)",
  borderRadius: "10px",
  color: "hsl(210, 20%, 92%)",
  fontSize: "12px",
};

function StatCard({
  title,
  value,
  prefix = "",
  suffix = "",
  caption,
  icon: Icon,
}: {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  caption: string;
  icon: React.ElementType;
}) {
  return (
    <div className="group relative bg-card rounded-xl border border-border p-5 transition-all duration-300 hover:border-primary/30 overflow-hidden h-full">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</span>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="text-3xl font-bold text-foreground font-body tracking-tight">{prefix}{value.toLocaleString()}{suffix}</div>
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>{caption}</span>
        </div>
      </div>
    </div>
  );
}

const Dashboard = () => {
  const { data, isLoading } = useDashboardStats();
  const [timeframe, setTimeframe] = useState<TimeframePreset>("7d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [gmtTime, setGmtTime] = useState("");

  useEffect(() => {
    const tick = () => {
      setGmtTime(new Date().toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  if (isLoading || !data) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading real-time metrics...</div>;
  }

  const { stats, callData, agentPerformance, channelData, liveAgents, recentActivity } = data;
  const topIndustries = agentPerformance.slice(0, 5);

  return (
    <div className="space-y-6 pb-20">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
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
              <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">UTC · {gmtTime}</Badge>
            </div>
            <h1 className="text-3xl font-bold text-foreground font-body tracking-tight">Your Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Live summary of campaigns, calls, revenue, and agent activity.</p>
          </div>
          <div className="flex items-center gap-3">
            <TimeframeFilter value={timeframe} onChange={setTimeframe} customRange={customRange} onCustomRangeChange={setCustomRange} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
        <div className="col-span-1"><StatCard title="Total Calls" value={stats.totalCalls} caption={`${stats.activeCampaignsCount} active campaigns`} icon={Phone} /></div>
        <div className="col-span-1"><StatCard title="Active Leads" value={stats.activeLeads} caption="Leads marked qualified" icon={Users} /></div>
        <div className="col-span-1"><StatCard title="Conversion" value={stats.conversion} suffix="%" caption="Completed call conversion" icon={TrendingUp} /></div>
        <div className="col-span-1"><StatCard title="Revenue" value={Math.round(stats.revenue)} prefix="$" caption="Estimated from stored calls" icon={DollarSign} /></div>
        <div className="col-span-1"><StatCard title="AI Agents" value={stats.aiAgentsCount} caption="Non-idle agents" icon={Bot} /></div>
        <div className="col-span-1"><StatCard title="Avg Response" value={stats.avgResponseTime} suffix="s" caption="Current placeholder benchmark" icon={Clock} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        <Card className="lg:col-span-4 bg-card border-border p-5 h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Call Volume & Conversions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Recent actual call activity</p>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Live</Badge>
          </div>
          <div className="flex-1 min-h-0 relative z-10 flex flex-col">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={callData}>
                <defs>
                  <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(170, 100%, 45%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(170, 100%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 14%)" />
                <XAxis dataKey="name" stroke="hsl(215, 12%, 40%)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(215, 12%, 40%)" fontSize={11} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="calls" stroke="hsl(170, 100%, 45%)" fill="url(#callGrad)" strokeWidth={2.5} dot={false} />
                <Area type="monotone" dataKey="conversions" stroke="hsl(200, 80%, 55%)" fill="none" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2 bg-card border-border p-5 h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Channel Distribution</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Inferred from available app flows</p>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Estimate</Badge>
          </div>
          <div className="flex justify-center h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {channelData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 shrink-0">
            {channelData.map((channel) => (
              <div key={channel.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: channel.fill }} />
                <span className="text-muted-foreground truncate">{channel.name}</span>
                <span className="text-foreground font-medium ml-auto">{channel.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        <Card className="lg:col-span-4 bg-card border-border p-5 h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Industry Performance</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Derived from campaign and call data</p>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Top Industries</Badge>
          </div>
          {topIndustries.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topIndustries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 14%)" />
                  <XAxis dataKey="name" stroke="hsl(215, 12%, 40%)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(215, 12%, 40%)" fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="leads" fill="hsl(170, 100%, 45%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3 mt-4">
                {topIndustries.map((industry) => (
                  <div key={industry.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{industry.name}</span>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{industry.active} campaigns</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{industry.leads} leads</span>
                        <span className="text-primary font-semibold">{industry.conversion}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">No industry performance data yet.</div>
          )}
        </Card>

        <Card className="lg:col-span-2 bg-card border-border p-5 h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Live Agent Feed</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Current agent presence</p>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Agents</Badge>
          </div>
          <div className="space-y-3 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
            {liveAgents.length > 0 ? (
              liveAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{agent.name}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${agent.status === "on-call" ? "bg-primary" : "bg-muted-foreground"}`} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{agent.geo} · {agent.campaign}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-muted-foreground">No active agents online.</div>
            )}
          </div>
          <Button variant="ghost" size="sm" className="w-full mt-auto text-xs text-muted-foreground gap-1 hover:text-primary">
            View Call Center <ChevronRight className="h-3 w-3" />
          </Button>
        </Card>
      </div>

      <Card className="bg-card border-border p-5 h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Activity Stream</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Latest events from stored call activity</p>
          </div>
          <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Live</Badge>
        </div>
        {recentActivity.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentActivity.map((item, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/10 hover:bg-muted/20 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0"><Sparkles className="h-4 w-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{item.action}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-sm text-muted-foreground">No activity yet.</div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
