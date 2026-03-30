import { useState, useEffect, useCallback } from "react";
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
  GripVertical,
  Plus,
  Trash2,
  Layout,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

// ── types ─────────────────────────────────────────────
type WidgetType = 'kpi' | 'chart-large' | 'chart-small' | 'table-large' | 'table-small' | 'activity';

interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  category?: string;
  component: string;
  width: 'full' | 'half' | 'third' | 'sixth' | 'twothirds';
  description: string;
}

// ── icon map ──────────────────────────────────────────
const iconMap: Record<string, React.ElementType> = {
  TrendingUp,
  Phone,
  Zap,
  Users,
  Bot,
  Globe,
  DollarSign,
  Activity,
  Clock,
  Sparkles,
  Brain,
  Signal,
  Cpu,
};

const activityTypeColor: Record<string, string> = {
  success: "text-primary",
  info: "text-chart-2",
  neutral: "text-muted-foreground",
};

const tooltipStyle = {
  backgroundColor: "hsl(220, 18%, 10%)",
  border: "1px solid hsl(220, 14%, 18%)",
  borderRadius: "10px",
  color: "hsl(210, 20%, 92%)",
  fontSize: "12px",
};

// ── animated counter hook ──────────────────────────────
function useAnimatedNumber(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
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

const AVAILABLE_WIDGETS: DashboardWidget[] = [
  { id: 'stat-calls', type: 'kpi', title: 'Total Calls', component: 'TotalCalls', width: 'sixth', description: 'Real-time count of all outbound calls made across all campaigns.' },
  { id: 'stat-leads', type: 'kpi', title: 'Active Leads', component: 'ActiveLeads', width: 'sixth', description: 'Number of leads currently being processed or qualified by AI agents.' },
  { id: 'stat-conv', type: 'kpi', title: 'Conversion', component: 'Conversion', width: 'sixth', description: 'Percentage of calls that resulted in a successful conversion or qualified lead.' },
  { id: 'stat-rev', type: 'kpi', title: 'Revenue', component: 'Revenue', width: 'sixth', description: 'Estimated revenue generated from converted leads based on campaign value.' },
  { id: 'stat-agents', type: 'kpi', title: 'AI Agents', component: 'AiAgents', width: 'sixth', description: 'Number of AI agents currently active or scheduled to deploy.' },
  { id: 'stat-resp', type: 'kpi', title: 'Avg Response', component: 'AvgResponse', width: 'sixth', description: 'Average time for an AI agent to initiate a call or respond to a trigger.' },
  { id: 'chart-volume', type: 'chart-large', title: 'Call Volume & Conversions', component: 'CallVolumeChart', width: 'twothirds', description: 'Historical view of call volume and conversion trends over the selected timeframe.' },
  { id: 'chart-channels', type: 'chart-small', title: 'Channel Distribution', component: 'ChannelChart', width: 'third', description: 'Breakdown of leads by their initial communication channel (Voice, SMS, Email, etc.).' },
  { id: 'perf-industry', type: 'table-large', title: 'Industry Performance', component: 'IndustryPerformance', width: 'twothirds', description: 'Comparative performance metrics across different industry verticals.' },
  { id: 'live-agents', type: 'table-small', title: 'Live Agent Feed', component: 'LiveAgentFeed', width: 'third', description: 'Real-time status updates from active AI agents including current call duration.' },
  { id: 'activity-stream', type: 'activity', title: 'Activity Stream', component: 'ActivityStream', width: 'full', description: 'Sequential feed of all AI system events, milestones, and qualifying outcomes.' },
];

// ── widget components ──────────────────────────────────
interface StatCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  icon: React.ElementType;
  onRemove: () => void;
  description: string;
}

const StatCard = ({ title, value, prefix = "", suffix = "", change, changeType, icon: Icon, onRemove, description }: StatCardProps) => {
  const animatedValue = useAnimatedNumber(value);
  const changeColor = changeType === "up" ? "text-primary" : changeType === "down" ? "text-destructive" : "text-muted-foreground";
  const ChangeIcon = changeType === "up" ? ArrowUpRight : changeType === "down" ? ArrowDownRight : Activity;

  return (
    <div className="group relative bg-card rounded-xl border border-border p-5 transition-all duration-300 hover:border-primary/30 overflow-hidden h-full">
      <div className="absolute inset-0 neural-grid opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors outline-none shrink-0">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-card border-border text-foreground text-xs p-3 max-w-[200px] z-50">
                  <p className="font-semibold mb-1">{title}</p>
                  <p className="text-muted-foreground leading-relaxed">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>
        <div className="text-3xl font-bold text-foreground font-body tracking-tight">
          {prefix}{animatedValue.toLocaleString()}{suffix}
        </div>
        <div className={`flex items-center gap-1 mt-2 text-xs ${changeColor}`}>
          <ChangeIcon className="h-3 w-3" />
          <span>{change}</span>
        </div>
      </div>
    </div>
  );
};

interface ChartWidgetProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onRemove: () => void;
  widthClass: string;
  description: string;
}

const ChartWidget = ({ title, subtitle, children, onRemove, widthClass, description }: ChartWidgetProps) => (
  <Card className={`${widthClass} bg-card border-border p-5 group relative h-full flex flex-col overflow-hidden`}>
    <div className="flex items-center justify-between mb-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors outline-none shrink-0">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-card border-border text-foreground text-xs p-3 max-w-[250px] z-50">
                  <p className="font-semibold mb-1">{title}</p>
                  <p className="text-muted-foreground leading-relaxed">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">Widget</Badge>
      </div>
    </div>
    <div className="flex-1 min-h-0 relative z-10 flex flex-col">
      {children}
    </div>
  </Card>
);

// ── main component ─────────────────────────────────────
const Dashboard = () => {
  const { data, isLoading } = useDashboardStats();
  const [timeframe, setTimeframe] = useState<TimeframePreset>("7d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [gmtTime, setGmtTime] = useState("");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  
  // Widget management - Default to empty list for a clean start
  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('dashboard-widgets') : null;
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('dashboard-widgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

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

  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(activeWidgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setActiveWidgets(items);
  }, [activeWidgets]);

  const removeWidget = useCallback((id: string) => {
    setActiveWidgets(prev => prev.filter(wId => wId !== id));
  }, []);

  const addWidget = useCallback((id: string) => {
    setActiveWidgets(prev => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }, []);

  if (isLoading || !data) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading real-time metrics...</div>;
  }

  const { stats, callData, agentPerformance, channelData, liveAgents, recentActivity } = data;

  const renderWidget = (id: string) => {
    const widget = AVAILABLE_WIDGETS.find(w => w.id === id);
    if (!widget) return null;

    switch (widget.id) {
      case 'stat-calls': return <StatCard key={id} title="Total Calls" value={stats.totalCalls} change="+12.5%" changeType="up" icon={Phone} onRemove={() => removeWidget(id)} description={widget.description} />;
      case 'stat-leads': return <StatCard key={id} title="Active Leads" value={stats.activeLeads} change="+8.2%" changeType="up" icon={Users} onRemove={() => removeWidget(id)} description={widget.description} />;
      case 'stat-conv': return <StatCard key={id} title="Conversion" value={stats.conversion} suffix="%" change="+2.1%" changeType="up" icon={TrendingUp} onRemove={() => removeWidget(id)} description={widget.description} />;
      case 'stat-rev': return <StatCard key={id} title="Revenue" value={Math.round(stats.revenue / 1000)} prefix="$" suffix="K" change="+18.3%" changeType="up" icon={DollarSign} onRemove={() => removeWidget(id)} description={widget.description} />;
      case 'stat-agents': return <StatCard key={id} title="AI Agents" value={stats.aiAgentsCount} change="3 deploying" changeType="neutral" icon={Bot} onRemove={() => removeWidget(id)} description={widget.description} />;
      case 'stat-resp': return <StatCard key={id} title="Avg Response" value={stats.avgResponseTime} suffix="s" change="-0.3s" changeType="up" icon={Clock} onRemove={() => removeWidget(id)} description={widget.description} />;
      case 'chart-volume': return (
        <ChartWidget key={id} title="Call Volume & Conversions" subtitle="Real-time AI agent performance" onRemove={() => removeWidget(id)} widthClass="w-full" description={widget.description}>
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
        </ChartWidget>
      );
      case 'chart-channels': return (
        <ChartWidget key={id} title="Channel Distribution" subtitle="Leads by communication channel" onRemove={() => removeWidget(id)} widthClass="w-full" description={widget.description}>
          <div className="flex justify-center h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {channelData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 shrink-0">
            {channelData.map((ch: any) => (
              <div key={ch.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ch.fill }} />
                <span className="text-muted-foreground truncate">{ch.name}</span>
                <span className="text-foreground font-medium ml-auto">{ch.value}%</span>
              </div>
            ))}
          </div>
        </ChartWidget>
      );
      case 'perf-industry': return (
        <ChartWidget key={id} title="Industry Performance" subtitle="AI performance by vertical" onRemove={() => removeWidget(id)} widthClass="w-full" description={widget.description}>
          <div className="space-y-4 overflow-y-auto max-h-[200px] pr-2 custom-scrollbar">
            {agentPerformance.map((ind: any) => (
              <div key={ind.name}>
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
                <Progress value={ind.conversion * 4} className="h-1.5 bg-secondary" />
              </div>
            ))}
          </div>
        </ChartWidget>
      );
      case 'live-agents': return (
        <ChartWidget key={id} title="Live Agent Feed" subtitle="Real-time agent status" onRemove={() => removeWidget(id)} widthClass="w-full" description={widget.description}>
          <div className="space-y-3 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
            {liveAgents.length > 0 ? (
              liveAgents.map((agent: any) => (
                <div key={agent.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{agent.name}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${agent.status === 'on-call' ? 'bg-primary' : 'bg-muted-foreground'}`} />
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
        </ChartWidget>
      );
      case 'activity-stream': return (
        <ChartWidget key={id} title="Activity Stream" subtitle="AI system events & milestones" onRemove={() => removeWidget(id)} widthClass="w-full" description={widget.description}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentActivity.map((item: any, i: number) => {
              const Icon = iconMap[item.icon] || Activity;
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/10 hover:bg-muted/20 transition-colors">
                  <div className={`w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 ${activityTypeColor[item.type]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{item.action}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
                </div>
              );
            })}
          </div>
        </ChartWidget>
      );
      default: return null;
    }
  };

  const getWidthClass = (id: string) => {
    const widget = AVAILABLE_WIDGETS.find(w => w.id === id);
    if (!widget) return '';
    switch (widget.width) {
      case 'sixth': return 'col-span-1';
      case 'third': return 'col-span-1 lg:col-span-2';
      case 'half': return 'col-span-1 lg:col-span-3';
      case 'twothirds': return 'col-span-1 lg:col-span-4';
      case 'full': return 'col-span-1 lg:col-span-6';
      default: return 'col-span-1';
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* ── Header ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="absolute inset-0 neural-grid opacity-40" />
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
              <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">GMT 0 · {gmtTime}</Badge>
            </div>
            <h1 className="text-3xl font-bold text-foreground font-body tracking-tight">Your Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Customize your view by dragging and adding widgets.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <TimeframeFilter value={timeframe} onChange={setTimeframe} customRange={customRange} onCustomRangeChange={setCustomRange} />
            <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                  <Plus className="h-4 w-4" /> Add Widget
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-2xl">
                <DialogHeader><DialogTitle className="text-foreground">Widget Library</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
                  {AVAILABLE_WIDGETS.map((widget) => {
                    const isActive = activeWidgets.includes(widget.id);
                    return (
                      <div 
                        key={widget.id} 
                        className={`p-3 rounded-lg border border-border bg-secondary/30 flex flex-col items-center gap-2 text-center transition-all ${isActive ? 'opacity-50 grayscale' : 'hover:border-primary/50 cursor-pointer'}`}
                        onClick={() => !isActive && addWidget(widget.id)}
                      >
                        <Layout className="h-6 w-6 text-primary" />
                        <span className="text-xs font-medium text-foreground">{widget.title}</span>
                        <Button size="sm" variant={isActive ? "secondary" : "outline"} className="h-7 w-full text-[10px]" disabled={isActive}>
                          {isActive ? "Active" : "Add Widget"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ── Grid with Drag & Drop ───────────────────── */}
      {activeWidgets.length > 0 ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboard-widgets" direction="vertical">
            {(provided) => (
              <div 
                {...provided.droppableProps} 
                ref={provided.innerRef}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6"
              >
                {activeWidgets.map((widgetId, index) => (
                  <Draggable key={widgetId} draggableId={widgetId} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`${getWidthClass(widgetId)} ${snapshot.isDragging ? 'z-50' : ''}`}
                      >
                        <div {...provided.dragHandleProps} className="h-full">
                          {renderWidget(widgetId)}
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="text-center py-20 bg-card/50 rounded-2xl border border-dashed border-border opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
          <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-medium text-foreground">Your dashboard is empty</h3>
          <p className="text-sm text-muted-foreground mb-6">Start by adding widgets from the library</p>
          <Button variant="outline" className="border-border hover:bg-secondary/50" onClick={() => setIsLibraryOpen(true)}>Open Library</Button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
