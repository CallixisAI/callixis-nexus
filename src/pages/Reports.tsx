import { useState } from "react";
import { BarChart3, TrendingUp, Phone, Users, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const callVolumeData = [
  { name: "Week 1", calls: 4200, leads: 630 },
  { name: "Week 2", calls: 5100, leads: 780 },
  { name: "Week 3", calls: 4800, leads: 720 },
  { name: "Week 4", calls: 6200, leads: 930 },
];

const campaignPerformance = [
  { name: "Home Refi Q1", leads: 1240, converted: 198, rate: 16 },
  { name: "Auto Insurance", leads: 980, converted: 127, rate: 13 },
  { name: "Medical Plan", leads: 640, converted: 141, rate: 22 },
  { name: "Car Sales EU", leads: 520, converted: 49, rate: 9 },
  { name: "Life Insurance", leads: 870, converted: 113, rate: 13 },
];

const outcomeData = [
  { name: "Converted", value: 628, color: "hsl(170, 100%, 45%)" },
  { name: "Callback", value: 412, color: "hsl(200, 80%, 55%)" },
  { name: "No Answer", value: 890, color: "hsl(220, 14%, 30%)" },
  { name: "Rejected", value: 320, color: "hsl(0, 72%, 51%)" },
];

const tooltipStyle = {
  backgroundColor: "hsl(220, 18%, 10%)",
  border: "1px solid hsl(220, 14%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 92%)",
};

const Reports = () => {
  const [timeframe, setTimeframe] = useState<TimeframePreset>("30d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Analytics and performance reports</p>
        </div>
        <TimeframeFilter
          value={timeframe}
          onChange={setTimeframe}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Calls", value: "20,300", change: "+14.2%", up: true, icon: Phone },
          { label: "Leads Generated", value: "3,060", change: "+11.8%", up: true, icon: Users },
          { label: "Conversion Rate", value: "15.1%", change: "+1.3%", up: true, icon: TrendingUp },
          { label: "Revenue", value: "$94.2K", change: "+22.5%", up: true, icon: DollarSign },
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4">
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

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Volume */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Call Volume & Leads</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={callVolumeData}>
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
              <Area type="monotone" dataKey="leads" stroke="hsl(200, 80%, 55%)" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Outcome Distribution */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Call Outcomes</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={outcomeData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {outcomeData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {outcomeData.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="text-foreground font-medium ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Campaign Performance</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 pl-5">Campaign</th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Leads</th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Converted</th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3">Rate</th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider p-3 w-48">Progress</th>
            </tr>
          </thead>
          <tbody>
            {campaignPerformance.map((c, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="p-3 pl-5 text-sm font-medium text-foreground">{c.name}</td>
                <td className="p-3 text-sm text-muted-foreground">{c.leads.toLocaleString()}</td>
                <td className="p-3 text-sm text-primary font-medium">{c.converted}</td>
                <td className="p-3 text-sm text-foreground">{c.rate}%</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.rate * 4}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8">{c.rate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;
