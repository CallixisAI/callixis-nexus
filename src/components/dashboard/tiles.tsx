// Dashboard tiles plan §F.1 — DASHBOARD_TILE_RENDERERS. Every body below is the VERBATIM JSX
// lifted out of the old Dashboard.tsx (nothing rewritten, only re-homed), minus each tile's old
// grid-positioning wrapper (`<div className="col-span-1">`, `lg:col-span-4`, …) — DashboardTile.tsx
// now owns width/positioning via TILE_WIDTH_CLASS, so a tile renderer only ever returns its own
// content.
//
// 🔑 §F.2 — renderers take `ctx` as a PROP, not a React context. A context re-renders all 16
// tiles — three recharts trees among them — on every frame of a drag; a prop only re-renders a
// tile when ITS OWN prop actually changes (assuming DashboardTile.tsx wraps each renderer call in
// React.memo, which it does).

import {
  Phone,
  Users,
  TrendingUp,
  DollarSign,
  Bot,
  Clock,
  ChevronRight,
  Sparkles,
  PhoneCall,
  Target,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/StatCard";
import { tooltipStyle } from "@/components/dashboard/chartTheme";
import { formatPercent, formatDurationLabel } from "@/lib/callPipeline";
import type { TileId } from "@/lib/dashboardTiles";
import type { useDashboardStats } from "@/hooks/useDashboardStats";
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

// Derived from the hook's own return type rather than duplicating (or newly exporting) its
// internal shape — see useDashboardStats.ts, whose `data` field is never `undefined` by the time
// a tile actually renders (Dashboard.tsx's own early-return already guarantees that).
export type DashboardData = NonNullable<ReturnType<typeof useDashboardStats>["data"]>;

export interface TileRenderContext {
  stats: DashboardData["stats"];
  callData: DashboardData["callData"];
  agentPerformance: DashboardData["agentPerformance"];
  leadPipelineData: DashboardData["leadPipelineData"];
  liveAgents: DashboardData["liveAgents"];
  recentActivity: DashboardData["recentActivity"];
  navigate: (path: string) => void;
}

export type TileRenderer = (ctx: TileRenderContext) => JSX.Element;

export const DASHBOARD_TILE_RENDERERS: Record<TileId, TileRenderer> = {
  "kpi.total-calls": (ctx) => (
    <StatCard title="Total Calls" value={ctx.stats.totalCalls} caption={`${ctx.stats.activeCampaignsCount} active campaigns`} icon={Phone} />
  ),
  "kpi.active-leads": (ctx) => (
    <StatCard title="Active Leads" value={ctx.stats.activeLeads} caption="Leads marked qualified" icon={Users} />
  ),
  "kpi.conversion": (ctx) => (
    <StatCard title="Conversion" value={formatPercent(ctx.stats.conversion)} caption="Completed call conversion" icon={TrendingUp} />
  ),
  "kpi.revenue": (ctx) => (
    <StatCard title="Revenue" value={Math.round(ctx.stats.revenue)} prefix="$" caption="Estimated from stored calls" icon={DollarSign} />
  ),
  "kpi.ai-agents": (ctx) => (
    <StatCard title="AI Agents" value={ctx.stats.aiAgentsCount} caption="Non-idle agents" icon={Bot} />
  ),
  "kpi.avg-time-to-first-call": (ctx) => (
    <StatCard
      title="Avg Time to First Call"
      value={formatDurationLabel(ctx.stats.avgTimeToFirstCallSeconds)}
      caption={ctx.stats.avgTimeToFirstCallSeconds === null ? "No calls placed yet" : "Lead created → first call"}
      icon={Clock}
    />
  ),
  "kpi.connect-rate": (ctx) => (
    <StatCard title="Connect Rate" value={ctx.stats.connectRate} suffix="%" caption="Reached vs no-answer/voicemail" icon={PhoneCall} />
  ),
  "kpi.avg-call-duration": (ctx) => (
    <StatCard title="Avg Call Duration" value={ctx.stats.avgDurationSeconds} suffix="s" caption="Among calls that connected" icon={Clock} />
  ),
  "kpi.qualified-rate": (ctx) => (
    <StatCard title="Qualified Rate" value={ctx.stats.qualifiedRate} suffix="%" caption="Of real call attempts" icon={Target} />
  ),
  "kpi.cost-per-qualified-lead": (ctx) => (
    <StatCard title="Cost / Qualified Lead" value={Number(ctx.stats.costPerQualifiedLead.toFixed(2))} prefix="$" caption="Vapi spend per qualified lead" icon={DollarSign} />
  ),

  "strip.leads-called": (ctx) => (
    <Card className="bg-card border-border p-4 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2">
        {ctx.stats.leadsDialingNow > 0 && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
        <span className="text-sm text-foreground">
          <span className="font-bold">{ctx.stats.leadsCalled.toLocaleString()}</span> / {ctx.stats.leadsTotal.toLocaleString()} leads called
        </span>
        <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">as of now</span>
      </div>
      <Badge variant="outline" className={`text-xs ${ctx.stats.leadsDialingNow > 0 ? "text-primary border-primary/30 bg-primary/10" : "text-muted-foreground"}`}>
        {ctx.stats.leadsDialingNow > 0 ? `${ctx.stats.leadsDialingNow} dialing now` : "Nothing dialing right now"}
      </Badge>
    </Card>
  ),

  "chart.call-volume": (ctx) => (
    <Card className="bg-card border-border p-5 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Call Volume & Conversions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Recent actual call activity</p>
        </div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Live</Badge>
      </div>
      {ctx.stats.totalCalls > 0 ? (
        <div className="flex-1 min-h-0 relative z-10 flex flex-col">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={ctx.callData}>
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
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-16">
          No calls yet. Upload leads and start a campaign to see activity here.
        </div>
      )}
    </Card>
  ),

  "chart.lead-pipeline": (ctx) => (
    <Card className="bg-card border-border p-5 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          {/* D.1 — real lead-pipeline buckets, not an invented Voice/SMS/WhatsApp/Email split
              (no channel field exists anywhere in this schema). */}
          <h3 className="text-sm font-semibold text-foreground">Lead Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Where every lead in your account stands right now</p>
        </div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">as of now</Badge>
      </div>
      {ctx.leadPipelineData.length > 0 ? (
        <>
          <div className="flex justify-center h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ctx.leadPipelineData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {ctx.leadPipelineData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 shrink-0">
            {ctx.leadPipelineData.map((slice) => (
              <div key={slice.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: slice.fill }} />
                <span className="text-muted-foreground truncate">{slice.name}</span>
                <span className="text-foreground font-medium ml-auto">{slice.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-16">
          No leads yet. Upload leads to a campaign to see the pipeline here.
        </div>
      )}
    </Card>
  ),

  "chart.industry-performance": (ctx) => {
    const topIndustries = ctx.agentPerformance.slice(0, 5);
    return (
      <Card className="bg-card border-border p-5 h-full flex flex-col overflow-hidden">
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
    );
  },

  "list.currently-dialing": (ctx) => (
    <Card className="bg-card border-border p-5 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          {/* D.11 — real leads currently mid-call, not per-AI-agent status: D.15's own recorded
              finding is that no campaign has ever been linked to an agent, so there is no real
              basis to attribute a call to a specific agent. */}
          <h3 className="text-sm font-semibold text-foreground">Currently Dialing</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Real leads mid-call right now</p>
        </div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">as of now</Badge>
      </div>
      <div className="space-y-3 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
        {ctx.liveAgents.length > 0 ? (
          ctx.liveAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{agent.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${agent.status === "on-call" ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{agent.duration} · {agent.geo} · {agent.campaign}</div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-xs text-muted-foreground">Nothing dialing right now.</div>
        )}
      </div>
      {/* D.10 — wired to a real route instead of doing nothing. */}
      <Button variant="ghost" size="sm" className="w-full mt-auto text-xs text-muted-foreground gap-1 hover:text-primary" onClick={() => ctx.navigate("/call-center")}>
        View Call Center <ChevronRight className="h-3 w-3" />
      </Button>
    </Card>
  ),

  "stream.activity": (ctx) => (
    <Card className="bg-card border-border p-5 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Activity Stream</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Latest events from stored call activity</p>
        </div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Live</Badge>
      </div>
      {ctx.recentActivity.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ctx.recentActivity.map((item, index) => (
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
  ),
};
