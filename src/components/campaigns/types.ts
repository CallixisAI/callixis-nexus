export interface CallRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: "completed" | "no-answer" | "voicemail" | "callback" | "pending" | "in-progress" | "failed";
  duration: string;
  callDate: string;
  hasRecording: boolean;
  notes: string;
  agent: string;
}

export interface WorkHours {
  days: string[];
  startTime: string;
  endTime: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: "Active" | "Paused" | "Scheduled" | "Completed";
  calls: number;
  conversion: string;
  industry: string;
  agent: string;
  records: CallRecord[];
  workHours: WorkHours;
  maxQualifiedLeads: number;
  qualifiedLeadsSent: number;
  crmApiEndpoint: string;
}

export const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const statusColor: Record<string, string> = {
  Active: "bg-primary/10 text-primary border-primary/20",
  Paused: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  Scheduled: "bg-muted text-muted-foreground border-border",
  Completed: "bg-blue-400/10 text-blue-400 border-blue-400/20",
};

export const callStatusConfig: Record<string, { icon: string; color: string; label: string }> = {
  "completed": { icon: "CheckCircle", color: "text-primary", label: "Completed" },
  "no-answer": { icon: "XCircle", color: "text-yellow-400", label: "No Answer" },
  "voicemail": { icon: "FileAudio", color: "text-blue-400", label: "Voicemail" },
  "callback": { icon: "Phone", color: "text-orange-400", label: "Callback" },
  "pending": { icon: "Clock", color: "text-muted-foreground", label: "Pending" },
  "in-progress": { icon: "Play", color: "text-primary", label: "In Progress" },
  "failed": { icon: "XCircle", color: "text-destructive", label: "Failed" },
};
