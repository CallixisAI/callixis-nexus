import { useState, useMemo, useCallback } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Bot,
  ExternalLink,
  Clock,
  FileText,
  Filter,
  Plus,
  Pencil,
  CalendarClock,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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

// Helper: create a UTC date (all times in GMT 0)
const utcDate = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m, d, h, min));

// ── types ──────────────────────────────────────────────
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
  callRecordingUrl: string;
  summary: string;
  duration: string;
}

// ── initial mock data ──────────────────────────────────
const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: "evt-001", type: "callback",
    date: utcDate(2026, 2, 25, 10, 0), time: "10:00 AM",
    agentName: "Agent Nova", leadId: "LD-4821", leadName: "James Mitchell",
    geo: "New York, US", geoFlag: "🇺🇸", campaignName: "Home Refi Q1",
    callRecordingUrl: "#call-rec-001",
    summary: "Lead interested in refinancing. Requested callback after reviewing rates. Pre-qualified for $450K.",
    duration: "4:32",
  },
  {
    id: "evt-002", type: "appointment",
    date: utcDate(2026, 2, 25, 14, 30), time: "2:30 PM",
    agentName: "Agent Pulse", leadId: "LD-4835", leadName: "Sarah Chen",
    geo: "Toronto, CA", geoFlag: "🇨🇦", campaignName: "Insurance Shield",
    callRecordingUrl: "#call-rec-002",
    summary: "Booked consultation for auto + home bundle. Currently paying $320/mo, wants better rate.",
    duration: "6:15",
  },
  {
    id: "evt-003", type: "callback",
    date: utcDate(2026, 2, 26, 9, 0), time: "9:00 AM",
    agentName: "Agent Nova", leadId: "LD-4840", leadName: "Carlos Rivera",
    geo: "Miami, US", geoFlag: "🇺🇸", campaignName: "Solar Leads Pro",
    callRecordingUrl: "#call-rec-003",
    summary: "Homeowner interested in solar installation. Needs a Spanish-speaking rep for follow-up.",
    duration: "3:48",
  },
  {
    id: "evt-004", type: "appointment",
    date: utcDate(2026, 2, 27, 11, 0), time: "11:00 AM",
    agentName: "Agent Vox", leadId: "LD-4852", leadName: "Emily Watson",
    geo: "London, UK", geoFlag: "🇬🇧", campaignName: "Med Plan Q1",
    callRecordingUrl: "#call-rec-004",
    summary: "Needs private health insurance for family of 4. Comparing NHS supplemental plans.",
    duration: "7:22",
  },
  {
    id: "evt-005", type: "callback",
    date: utcDate(2026, 2, 28, 15, 0), time: "3:00 PM",
    agentName: "Agent Pulse", leadId: "LD-4861", leadName: "David Park",
    geo: "Seoul, KR", geoFlag: "🇰🇷", campaignName: "Auto Deals Spring",
    callRecordingUrl: "#call-rec-005",
    summary: "Looking to lease an EV. Budget $500/mo. Wants test drive appointment next week.",
    duration: "5:10",
  },
  {
    id: "evt-006", type: "appointment",
    date: utcDate(2026, 2, 30, 10, 30), time: "10:30 AM",
    agentName: "Agent Nova", leadId: "LD-4878", leadName: "Aisha Mohammed",
    geo: "Dubai, AE", geoFlag: "🇦🇪", campaignName: "RE Investment",
    callRecordingUrl: "#call-rec-006",
    summary: "High-value investor, interested in off-plan properties in Downtown. Budget $1.2M+.",
    duration: "8:45",
  },
  {
    id: "evt-007", type: "callback",
    date: utcDate(2026, 2, 25, 16, 0), time: "4:00 PM",
    agentName: "Agent Vox", leadId: "LD-4882", leadName: "Marco Rossi",
    geo: "Milan, IT", geoFlag: "🇮🇹", campaignName: "Home Refi Q1",
    callRecordingUrl: "#call-rec-007",
    summary: "Wants to consolidate 2 mortgages. Total outstanding €380K. Good credit score.",
    duration: "5:55",
  },
  {
    id: "evt-008", type: "appointment",
    date: utcDate(2026, 2, 31, 9, 30), time: "9:30 AM",
    agentName: "Agent Pulse", leadId: "LD-4890", leadName: "Linda Nguyen",
    geo: "Sydney, AU", geoFlag: "🇦🇺", campaignName: "Insurance Shield",
    callRecordingUrl: "#call-rec-008",
    summary: "Business owner needing liability + workers comp. 12 employees, construction industry.",
    duration: "9:02",
  },
];

const ALL_AGENTS = ["Agent Nova", "Agent Pulse", "Agent Vox"];
const GEO_OPTIONS = [
  { label: "New York, US", flag: "🇺🇸" },
  { label: "Miami, US", flag: "🇺🇸" },
  { label: "Toronto, CA", flag: "🇨🇦" },
  { label: "London, UK", flag: "🇬🇧" },
  { label: "Seoul, KR", flag: "🇰🇷" },
  { label: "Dubai, AE", flag: "🇦🇪" },
  { label: "Milan, IT", flag: "🇮🇹" },
  { label: "Sydney, AU", flag: "🇦🇺" },
];

const typeStyles: Record<EventType, string> = {
  callback: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  appointment: "bg-primary/15 text-primary border-primary/25",
};

const typeDot: Record<EventType, string> = {
  callback: "bg-amber-400",
  appointment: "bg-primary",
};

// ── form defaults ──────────────────────────────────────
interface EventFormData {
  type: EventType;
  date: Date | undefined;
  time: string;
  agentName: string;
  leadId: string;
  leadName: string;
  geo: string;
  campaignName: string;
  summary: string;
}

const emptyForm: EventFormData = {
  type: "appointment",
  date: undefined,
  time: "",
  agentName: "",
  leadId: "",
  leadName: "",
  geo: "",
  campaignName: "",
  summary: "",
};

// ── component ──────────────────────────────────────────
export default function CalendarScheduling() {
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [currentMonth, setCurrentMonth] = useState(utcDate(2026, 2, 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(utcDate(2026, 2, 25));
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterGeo, setFilterGeo] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  // Create / Edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormData>(emptyForm);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Reschedule dialog
  const [rescheduleEvent, setRescheduleEvent] = useState<CalendarEvent | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>();
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleDateOpen, setRescheduleDateOpen] = useState(false);

  // Drag-and-drop state
  const [dragEventId, setDragEventId] = useState<string | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, eventId: string) => {
    e.dataTransfer.setData("text/plain", eventId);
    e.dataTransfer.effectAllowed = "move";
    setDragEventId(eventId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetDate(dateKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetDate(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData("text/plain");
    if (!eventId) return;

    setEvents((prev) => {
      const evt = prev.find((ev) => ev.id === eventId);
      if (!evt || isSameDay(evt.date, targetDate)) return prev;
      return prev.map((ev) =>
        ev.id === eventId ? { ...ev, date: targetDate } : ev
      );
    });

    const evt = events.find((ev) => ev.id === eventId);
    if (evt && !isSameDay(evt.date, targetDate)) {
      toast.success(`Moved "${evt.leadName}" to ${format(targetDate, "MMM d")}`);
    }

    setDragEventId(null);
    setDropTargetDate(null);
  }, [events]);

  const handleDragEnd = useCallback(() => {
    setDragEventId(null);
    setDropTargetDate(null);
  }, []);

  // Build calendar grid
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
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Derived lists from current events
  const AGENTS = useMemo(() => [...new Set(events.map((e) => e.agentName))], [events]);
  const GEOS = useMemo(() => [...new Set(events.map((e) => e.geo))], [events]);

  // Filtered events
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterAgent !== "all" && e.agentName !== filterAgent) return false;
      if (filterGeo !== "all" && e.geo !== filterGeo) return false;
      if (filterType !== "all" && e.type !== filterType) return false;
      return true;
    });
  }, [events, filterAgent, filterGeo, filterType]);

  const eventsForDay = (d: Date) => filtered.filter((e) => isSameDay(e.date, d));

  const selectedDayEvents = selectedDate
    ? filtered.filter((e) => isSameDay(e.date, selectedDate))
    : [];

  const totalCallbacks = filtered.filter((e) => e.type === "callback").length;
  const totalAppointments = filtered.filter((e) => e.type === "appointment").length;

  // ── Create / Edit handlers ───────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, date: selectedDate || undefined });
    setFormOpen(true);
  };

  const openEdit = (evt: CalendarEvent) => {
    setEditingId(evt.id);
    setForm({
      type: evt.type,
      date: evt.date,
      time: evt.time,
      agentName: evt.agentName,
      leadId: evt.leadId,
      leadName: evt.leadName,
      geo: evt.geo,
      campaignName: evt.campaignName,
      summary: evt.summary,
    });
    setDetailEvent(null);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.date || !form.time || !form.leadName || !form.agentName) {
      toast.error("Please fill in date, time, lead name, and agent.");
      return;
    }
    const geoOption = GEO_OPTIONS.find((g) => g.label === form.geo);

    if (editingId) {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? {
                ...e,
                type: form.type,
                date: form.date!,
                time: form.time,
                agentName: form.agentName,
                leadId: form.leadId || e.leadId,
                leadName: form.leadName,
                geo: form.geo,
                geoFlag: geoOption?.flag || "🌍",
                campaignName: form.campaignName,
                summary: form.summary,
              }
            : e
        )
      );
      toast.success("Event updated successfully.");
    } else {
      const newEvt: CalendarEvent = {
        id: `evt-${Date.now()}`,
        type: form.type,
        date: form.date!,
        time: form.time,
        agentName: form.agentName,
        leadId: form.leadId || `LD-${Math.floor(Math.random() * 9000 + 1000)}`,
        leadName: form.leadName,
        geo: form.geo,
        geoFlag: geoOption?.flag || "🌍",
        campaignName: form.campaignName,
        callRecordingUrl: "#",
        summary: form.summary,
        duration: "—",
      };
      setEvents((prev) => [...prev, newEvt]);
      toast.success("Event created successfully.");
    }
    setFormOpen(false);
  };

  const handleDelete = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setDetailEvent(null);
    toast.success("Event deleted.");
  };

  // ── Reschedule handlers ──────────────────────────────
  const openReschedule = (evt: CalendarEvent) => {
    setRescheduleEvent(evt);
    setRescheduleDate(evt.date);
    setRescheduleTime(evt.time);
    setDetailEvent(null);
  };

  const handleReschedule = () => {
    if (!rescheduleEvent || !rescheduleDate || !rescheduleTime) return;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === rescheduleEvent.id
          ? { ...e, date: rescheduleDate, time: rescheduleTime }
          : e
      )
    );
    toast.success(`Rescheduled to ${format(rescheduleDate, "MMM d")} at ${rescheduleTime}`);
    setRescheduleEvent(null);
  };

  const updateForm = (key: keyof EventFormData, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calendar & Scheduling</h1>
            <p className="text-sm text-muted-foreground">
              All callbacks & appointments set by AI agents
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-amber-400 font-medium">{totalCallbacks} Callbacks</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs text-primary font-medium">{totalAppointments} Appointments</span>
          </div>
          {/* Create button */}
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-[160px] h-8 text-xs bg-card border-border">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {AGENTS.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterGeo} onValueChange={setFilterGeo}>
          <SelectTrigger className="w-[180px] h-8 text-xs bg-card border-border">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {GEOS.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] h-8 text-xs bg-card border-border">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="callback">Callbacks</SelectItem>
            <SelectItem value="appointment">Appointments</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        {/* Calendar */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{format(currentMonth, "MMMM yyyy")}</h2>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground font-mono">GMT 0</Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {weeks.map((week, wi) =>
              week.map((dayDate, di) => {
                const dayEvents = eventsForDay(dayDate);
                const inMonth = isSameMonth(dayDate, currentMonth);
                const isSelected = selectedDate && isSameDay(dayDate, selectedDate);
                const today = isToday(dayDate);
                const dateKey = format(dayDate, "yyyy-MM-dd");
                const isDropTarget = dropTargetDate === dateKey && dragEventId !== null;

                return (
                  <div
                    key={`${wi}-${di}`}
                    onClick={() => setSelectedDate(dayDate)}
                    onDragOver={(e) => handleDragOver(e, dateKey)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dayDate)}
                    className={`relative min-h-[90px] p-1.5 border-b border-r border-border text-left transition-all cursor-pointer ${!inMonth ? "opacity-30" : ""} ${isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : "hover:bg-muted/30"} ${isDropTarget ? "bg-primary/10 ring-2 ring-inset ring-primary/50 scale-[1.02]" : ""}`}
                  >
                    <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${today ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                      {format(dayDate, "d")}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map((evt) => (
                        <div
                          key={evt.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, evt.id)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate border cursor-grab active:cursor-grabbing transition-opacity ${typeStyles[evt.type]} ${dragEventId === evt.id ? "opacity-40" : ""}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeDot[evt.type]}`} />
                          <span className="truncate">{evt.time} {evt.leadName.split(" ")[0]}</span>
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

        {/* Day detail sidebar */}
        <Card className="bg-card border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Select a day"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-primary" onClick={openCreate}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="p-3 space-y-3">
              {selectedDayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarCheck className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No events on this day</p>
                  <Button size="sm" variant="outline" className="mt-3 gap-1 text-xs" onClick={openCreate}>
                    <Plus className="h-3 w-3" /> Create Event
                  </Button>
                </div>
              ) : (
                selectedDayEvents.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => setDetailEvent(evt)}
                    className="w-full text-left p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${typeStyles[evt.type]}`}>
                        {evt.type === "callback" ? "Callback" : "Appointment"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {evt.time}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{evt.leadName}</span>
                      <a href={evt.callRecordingUrl} onClick={(e) => e.stopPropagation()} className="text-[10px] text-primary flex items-center gap-0.5 hover:underline">
                        {evt.leadId}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{evt.agentName}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{evt.geoFlag} {evt.geo}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{evt.summary}</p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* ── Event Detail Dialog ── */}
      <Dialog open={!!detailEvent} onOpenChange={(o) => !o && setDetailEvent(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          {detailEvent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={typeStyles[detailEvent.type]}>
                    {detailEvent.type === "callback" ? "Callback" : "Appointment"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(detailEvent.date, "MMM d, yyyy")} · {detailEvent.time}
                  </span>
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
                      <p className="text-foreground font-medium">{detailEvent.duration}</p>
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
                  <span className="text-sm text-muted-foreground">Lead ID</span>
                  <a href={detailEvent.callRecordingUrl} className="text-sm text-primary flex items-center gap-1 hover:underline font-medium">
                    {detailEvent.leadId}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                <Separator className="bg-border" />

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Call Summary</p>
                  <p className="text-sm text-foreground leading-relaxed">{detailEvent.summary}</p>
                </div>

                <Separator className="bg-border" />

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => openEdit(detailEvent)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => openReschedule(detailEvent)}>
                    <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => handleDelete(detailEvent.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingId ? "Edit Event" : "Create New Event"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2 max-h-[60vh] overflow-y-auto pr-1">
            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Event Type</Label>
              <Select value={form.type} onValueChange={(v) => updateForm("type", v as EventType)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="callback">Callback</SelectItem>
                  <SelectItem value="appointment">Appointment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Date <span className="text-destructive">*</span></Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.date && "text-muted-foreground")}>
                    <CalendarCheck className="mr-2 h-4 w-4" />
                    {form.date ? format(form.date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.date}
                    onSelect={(d) => { updateForm("date", d); setDatePickerOpen(false); }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Time <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. 2:30 PM"
                value={form.time}
                onChange={(e) => updateForm("time", e.target.value)}
                className="bg-background border-border"
              />
            </div>

            {/* Agent */}
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Agent <span className="text-destructive">*</span></Label>
              <Select value={form.agentName} onValueChange={(v) => updateForm("agentName", v)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_AGENTS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lead Name + ID */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Lead Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Full name"
                  value={form.leadName}
                  onChange={(e) => updateForm("leadName", e.target.value)}
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Lead ID</Label>
                <Input
                  placeholder="Auto-generated"
                  value={form.leadId}
                  onChange={(e) => updateForm("leadId", e.target.value)}
                  className="bg-background border-border"
                />
              </div>
            </div>

            {/* Geo */}
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Location</Label>
              <Select value={form.geo} onValueChange={(v) => updateForm("geo", v)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {GEO_OPTIONS.map((g) => (
                    <SelectItem key={g.label} value={g.label}>{g.flag} {g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Campaign */}
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Campaign</Label>
              <Input
                placeholder="Campaign name"
                value={form.campaignName}
                onChange={(e) => updateForm("campaignName", e.target.value)}
                className="bg-background border-border"
              />
            </div>

            {/* Summary */}
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Summary</Label>
              <Textarea
                placeholder="Brief call summary..."
                value={form.summary}
                onChange={(e) => updateForm("summary", e.target.value)}
                className="bg-background border-border min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingId ? "Save Changes" : "Create Event"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reschedule Dialog ── */}
      <Dialog open={!!rescheduleEvent} onOpenChange={(o) => !o && setRescheduleEvent(null)}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          {rescheduleEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-primary" />
                  Reschedule Event
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-sm font-medium text-foreground">{rescheduleEvent.leadName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Currently: {format(rescheduleEvent.date, "MMM d, yyyy")} at {rescheduleEvent.time}
                  </p>
                </div>

                {/* New date */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-foreground">New Date</Label>
                  <Popover open={rescheduleDateOpen} onOpenChange={setRescheduleDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !rescheduleDate && "text-muted-foreground")}>
                        <CalendarCheck className="mr-2 h-4 w-4" />
                        {rescheduleDate ? format(rescheduleDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={rescheduleDate}
                        onSelect={(d) => { setRescheduleDate(d); setRescheduleDateOpen(false); }}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* New time */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-foreground">New Time</Label>
                  <Input
                    placeholder="e.g. 3:00 PM"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 mt-4">
                <Button variant="outline" onClick={() => setRescheduleEvent(null)}>Cancel</Button>
                <Button onClick={handleReschedule}>Confirm Reschedule</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
