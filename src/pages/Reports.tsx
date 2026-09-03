import { useMemo, useState } from "react";
import { TrendingUp, Phone, Users, DollarSign, ArrowUpRight, ArrowDownRight, Bot } from "lucide-react";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useCampaigns } from "@/hooks/useCampaigns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { formatPercent } from "@/lib/callPipeline";
import { resolveTimeframeRange } from "@/lib/timeframe";
import { useAuth } from "@/contexts/AuthContext";

// Permission-overrides plan Phase 4 §H.5 (docs/permission-overrides-plan/README.md) —
// reports.export ("Export CSV/Excel") is seeded (every holder at `view` or `full`) but there is
// genuinely no export button anywhere on this page to gate — recorded here rather than forced
// onto something else. D-3's own concrete table already anticipated this ("Export button
// disabled" implies a button that doesn't exist yet). Wire it the day a real export feature is
// built, not before.

const tooltipStyle = {
  backgroundColor: "hsl(220, 18%, 10%)",
  border: "1px solid hsl(220, 14%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 92%)",
};

const formatCurrencyCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const Reports = () => {
  // reports.analytics_dashboard — every role that reaches this page already holds it (it's the
  // key the page-level `reports` grant is synthesized from for every one of them), so this is
  // structurally correct rather than newly restrictive; see the file header re: reports.export.
  const { hasPermission } = useAuth();
  const canViewAnalytics = hasPermission("reports.analytics_dashboard");
  const [timeframe, setTimeframe] = useState<TimeframePreset>("30d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  // D.9 — wired to real call-attempt filtering, same as Dashboard.tsx.
  const timeframeRange = useMemo(() => resolveTimeframeRange(timeframe, customRange), [timeframe, customRange]);
  const { data, isLoading } = useDashboardStats(timeframeRange);
  // C.16/E14 — not defaulted in the destructure; see Finance.tsx's identical comment.
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();

  const campaignPerformance = useMemo(
    () => (campaigns ?? []).map((campaign) => {
      const converted = campaign.records.filter((record) => record.status === "completed").length;
      return {
        name: campaign.name,
        leads: campaign.records.length,
        converted,
        rate: campaign.connectRate,
        budget: campaign.budget,
      };
    }).sort((a, b) => b.leads - a.leads),
    [campaigns]
  );

  // C.4/C.5 — the dead "Callback"/"Voicemail" call_records statuses (E3: never written, only
  // ever branched on) are gone; "Pending" is replaced by the three real pre-attempt buckets, and
  // "Excluded"/"Unattributed" (the counting model's own two non-attempt outcomes) are now shown
  // rather than silently folded into "Failed".
  const outcomeData = useMemo(() => {
    const allRecords = (campaigns ?? []).flatMap((campaign) => campaign.records);
    return [
      { name: "Completed", value: allRecords.filter((record) => record.status === "completed").length, color: "hsl(170, 100%, 45%)" },
      { name: "No Answer", value: allRecords.filter((record) => record.status === "no-answer").length, color: "hsl(220, 14%, 30%)" },
      { name: "Failed", value: allRecords.filter((record) => record.status === "failed").length, color: "hsl(0, 72%, 51%)" },
      { name: "In Pipeline", value: allRecords.filter((record) => ["queued", "dialing", "stalled"].includes(record.status)).length, color: "hsl(45, 93%, 47%)" },
      { name: "Excluded", value: allRecords.filter((record) => record.status === "excluded").length, color: "hsl(220, 9%, 46%)" },
      { name: "Unattributed", value: allRecords.filter((record) => record.status === "unattributed").length, color: "hsl(280, 20%, 55%)" },
    ].filter((item) => item.value > 0);
  }, [campaigns]);

  if (isLoading || campaignsLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading live reports...</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-muted-foreground">Unable to load reporting data.</div>;
  }

  if (!canViewAnalytics) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Viewing analytics needs the Reports — Analytics Dashboard permission.
      </div>
    );
  }

  const { stats, callData, agentPerformance } = data;
  const totalQualifiedLeads = (campaigns ?? []).reduce((sum, campaign) => sum + campaign.qualifiedLeadsSent, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Live analytics from your current campaigns and calls</p>
        </div>
        <TimeframeFilter
          value={timeframe}
          onChange={setTimeframe}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Calls", value: stats.totalCalls.toLocaleString(), change: `${stats.activeCampaignsCount} active campaigns`, up: true, icon: Phone },
          { label: "Qualified Leads", value: totalQualifiedLeads.toLocaleString(), change: `${stats.activeLeads} marked active`, up: true, icon: Users },
          { label: "Conversion Rate", value: formatPercent(stats.conversion), change: `${(campaigns ?? []).length} tracked campaigns`, up: true, icon: TrendingUp },
          { label: "Revenue", value: formatCurrencyCompact(stats.revenue), change: `${stats.aiAgentsCount} active agents`, up: true, icon: DollarSign },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
              <span className={`flex items-center text-[11px] font-medium ${kpi.up ? "text-green-500" : "text-destructive"}`}>
                {kpi.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {kpi.change}
              </span>
            </div>
            <p className="text-xl font-bold text-foreground">{kpi.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Recent Call Volume</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={callData}>
              <defs>
                <linearGradient id="reportGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(170, 100%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(170, 100%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="name" stroke="hsl(215, 12%, 55%)" fontSize={12} />
              <YAxis stroke="hsl(215, 12%, 55%)" fontSize={12} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="calls" stroke="hsl(170, 100%, 45%)" fill="url(#reportGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="conversions" stroke="hsl(200, 80%, 55%)" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Call Outcomes</h3>
          {outcomeData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">No call records yet.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={outcomeData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {outcomeData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {outcomeData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="text-foreground font-medium ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Campaign Performance</h3>
          </div>
          {campaignPerformance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No campaigns created yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 pl-5">Campaign</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Leads</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Converted</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Rate</th>
                  <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Budget</th>
                </tr>
              </thead>
              <tbody>
                {campaignPerformance.map((campaign) => (
                  <tr key={campaign.name} className="border-b border-border/50 last:border-0">
                    <td className="p-3 pl-5 text-sm font-medium text-foreground">{campaign.name}</td>
                    <td className="p-3 text-sm text-muted-foreground">{campaign.leads.toLocaleString()}</td>
                    <td className="p-3 text-sm text-primary font-medium">{campaign.converted}</td>
                    <td className="p-3 text-sm text-foreground">{campaign.rate.toFixed(1)}%</td>
                    <td className="p-3 text-sm text-muted-foreground">{formatCurrencyCompact(campaign.budget)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Industry Breakdown</h3>
          </div>
          {agentPerformance.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">No campaign data to analyse yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agentPerformance.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="name" stroke="hsl(215, 12%, 55%)" fontSize={11} />
                <YAxis stroke="hsl(215, 12%, 55%)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="leads" fill="hsl(170, 100%, 45%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {agentPerformance.length > 0 && (
            <div className="mt-4 space-y-2">
              {agentPerformance.slice(0, 4).map((industry) => (
                <div key={industry.name} className="flex items-center justify-between text-xs border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                  <span className="text-muted-foreground">{industry.name}</span>
                  <span className="text-foreground">{industry.leads} leads · {industry.conversion}% conversion</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
