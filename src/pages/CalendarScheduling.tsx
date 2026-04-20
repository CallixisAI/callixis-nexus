import { useMemo, useState } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Bot,
  Clock,
  FileText,
  Filter,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useCampaigns } from "@/hooks/useCampaigns";
import {
  addDays,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";

type EventType = "callback" | "appointment";

interface CalendarEvent {
  id: string;
  type: EventType;
  date: Date;
  time: string;
  agentName: string;
  leadId: string;
  leadName: string;
  geo: string;
  geoFlag: string;
  campaignName: string;
  summary: string;
  duration: string;
  status: string;
}

const typeStyles: Record<EventType, string> = {
  callback: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  appointment: "bg-primary/15 text-primary border-primary/25",
};

const typeDot: Record<EventType, string> = {
  callback: "bg-amber-400",
  appointment: "bg-primary",
};

const geoFlagForPhone = (phone: string) => {
  if (phone.startsWith("+1")) return "🇺🇸";
  if (phone.startsWith("+44")) return "🇬🇧";
  if (phone.startsWith("+61")) return "🇦🇺";
  if (phone.startsWith("+49")) return "🇩🇪";
  if (phone.startsWith("+33")) return "🇫🇷";
  if (phone.startsWith("+39")) return "🇮🇹";
  if (phone.startsWith("+34")) return "🇪🇸";
  return "🌍";
};

const geoLabelForPhone = (phone: string) => {
  if (phone.startsWith("+1")) return "United States/Canada";
  if (phone.startsWith("+44")) return "United Kingdom";
  if (phone.startsWith("+61")) return "Australia";
  if (phone.startsWith("+49")) return "Germany";
  if (phone.startsWith("+33")) return "France";
  if (phone.startsWith("+39")) return "Italy";
  if (phone.startsWith("+34")) return "Spain";
  return "Unknown region";
};

const formatDuration = (duration?: string) => duration && duration !== "0:00" ? duration : "Not recorded";

export default function CalendarScheduling() {
  const { campaigns = [], isLoading } = useCampaigns();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterGeo, setFilterGeo] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const events = useMemo<CalendarEvent[]>(() => {
    return campaigns.flatMap((campaign) =>
      campaign.records
        .filter((record) => record.callDate && record.callDate !== "—")
        .map((record) => {
          const phone = record.phone || "";
          const isQualified = ["completed", "callback"].includes(record.status);
          const eventDate = new Date(record.callDate.replace(" ", "T"));

          return {
            id: record.id,
            type: isQualified ? "appointment" : "callback",
            date: eventDate,
            time: format(eventDate, "p"),
            agentName: record.agent || campaign.agent,
            leadId: record.id.slice(0, 8).toUpperCase(),
            leadName: record.name || "Unknown lead",
            geo: geoLabelForPhone(phone),
            geoFlag: geoFlagForPhone(phone),
            campaignName: campaign.name,
            summary: record.notes || `${record.status} call for ${campaign.name}`,
            duration: record.duration,
            status: record.status,
          };
        })
    ).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [campaigns]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  const agents = useMemo(() => [...new Set(events.map((event) => event.agentName))].sort(), [events]);
  const geos = useMemo(() => [...new Set(events.map((event) => event.geo))].sort(), [events]);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (filterAgent !== "all" && event.agentName !== filterAgent) return false;
      if (filterGeo !== "all" && event.geo !== filterGeo) return false;
      if (filterType !== "all" && event.type !== filterType) return false;
      return true;
    });
  }, [events, filterAgent, filterGeo, filterType]);

  const eventsForDay = (date: Date) => filtered.filter((event) => isSameDay(event.date, date));
  const selectedDayEvents = selectedDate ? filtered.filter((event) => isSameDay(event.date, selectedDate)) : [];
  const totalCallbacks = filtered.filter((event) => event.type === "callback").length;
  const totalAppointments = filtered.filter((event) => event.type === "appointment").length;

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading live schedule...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calendar & Scheduling</h1>
            <p className="text-sm text-muted-foreground">Live schedule derived from campaign call records</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-amber-400 font-medium">{totalCallbacks} Follow-ups</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs text-primary font-medium">{totalAppointments} Qualified Calls</span>
          </div>
        </div>
      </div>

      <Card className="bg-card border-border">
        <div className="px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          This page is now read-only on purpose. It shows real scheduled activity inferred from calls already stored in the platform. Manual create/edit/reschedule was removed because it was only changing browser state and not saving anywhere.
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-[180px] h-8 text-xs bg-card border-border"><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((agent) => <SelectItem key={agent} value={agent}>{agent}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterGeo} onValueChange={setFilterGeo}>
          <SelectTrigger className="w-[200px] h-8 text-xs bg-card border-border"><SelectValue placeholder="All Locations" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {geos.map((geo) => <SelectItem key={geo} value={geo}>{geo}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px] h-8 text-xs bg-card border-border"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="callback">Follow-ups</SelectItem>
            <SelectItem value="appointment">Qualified Calls</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <Card className="bg-card border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <button className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-md" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{format(currentMonth, "MMMM yyyy")}</h2>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground font-mono">UTC</Badge>
            </div>
            <button className="h-8 w-8 inline-flex items-center justify-center hover:bg-muted rounded-md" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {weeks.map((week, weekIndex) =>
              week.map((dayDate, dayIndex) => {
                const dayEvents = eventsForDay(dayDate);
                const inMonth = isSameMonth(dayDate, currentMonth);
                const selected = selectedDate && isSameDay(dayDate, selectedDate);
                const today = isToday(dayDate);

                return (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    onClick={() => setSelectedDate(dayDate)}
                    className={`relative min-h-[90px] p-1.5 border-b border-r border-border text-left transition-all cursor-pointer ${!inMonth ? "opacity-30" : ""} ${selected ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : "hover:bg-muted/30"}`}
                  >
                    <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${today ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                      {format(dayDate, "d")}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div key={event.id} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate border ${typeStyles[event.type]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeDot[event.type]}`} />
                          <span className="truncate">{event.time} {event.leadName.split(" ")[0]}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="bg-card border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Select a day"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="p-3 space-y-3">
              {selectedDayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarCheck className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No live events on this day</p>
                </div>
              ) : (
                selectedDayEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setDetailEvent(event)}
                    className="w-full text-left p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${typeStyles[event.type]}`}>
                        {event.type === "callback" ? "Follow-up" : "Qualified Call"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {event.time}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{event.leadName}</span>
                      <span className="text-[10px] text-primary">{event.leadId}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{event.agentName}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.geoFlag} {event.geo}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{event.summary}</p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <Dialog open={!!detailEvent} onOpenChange={(open) => !open && setDetailEvent(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          {detailEvent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={typeStyles[detailEvent.type]}>
                    {detailEvent.type === "callback" ? "Follow-up" : "Qualified Call"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{format(detailEvent.date, "MMM d, yyyy")} · {detailEvent.time}</span>
                </div>
                <DialogTitle className="text-foreground mt-2">{detailEvent.leadName}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Agent</p>
                      <p className="text-foreground font-medium">{detailEvent.agentName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Location</p>
                      <p className="text-foreground font-medium">{detailEvent.geoFlag} {detailEvent.geo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
                      <p className="text-foreground font-medium">{formatDuration(detailEvent.duration)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Campaign</p>
                      <p className="text-foreground font-medium">{detailEvent.campaignName}</p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-border" />

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Stored Status</span>
                  <span className="text-sm text-foreground font-medium capitalize">{detailEvent.status}</span>
                </div>

                <Separator className="bg-border" />

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Call Notes</p>
                  <p className="text-sm text-foreground leading-relaxed">{detailEvent.summary}</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
