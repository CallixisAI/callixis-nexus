export const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  workHours: { days: string[]; startTime: string; endTime: string };
  maxQualifiedLeads: number;
  qualifiedLeadsSent: number;
  crmApiEndpoint: string;
}

export interface CallRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  duration: string;
  callDate: string;
  hasRecording: boolean;
  notes: string;
  agent: string;
}

export const statusColor: Record<string, string> = {
  "Active": "bg-primary/20 text-primary border-primary/30",
  "Paused": "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  "Scheduled": "bg-blue-500/20 text-blue-500 border-blue-500/30",
  "Completed": "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
};
