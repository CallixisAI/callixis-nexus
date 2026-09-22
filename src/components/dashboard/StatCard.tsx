import { Activity } from "lucide-react";

// Dashboard tiles plan §B.4 — moved verbatim from Dashboard.tsx:48-83. NOT the same component as
// the old, dead src/components/StatCard.tsx (§B.5 deletes that one — zero importers, a different
// API, same name, E4).

export function StatCard({
  title,
  value,
  prefix = "",
  suffix = "",
  caption,
  icon: Icon,
}: {
  title: string;
  // D.2 — a string escape hatch for "—" (no data yet), not just a number to be forced through
  // .toLocaleString().
  value: number | string;
  prefix?: string;
  suffix?: string;
  caption: string;
  icon: React.ElementType;
}) {
  const displayValue = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="group relative bg-card rounded-xl border border-border p-5 transition-all duration-300 hover:border-primary/30 overflow-hidden h-full">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</span>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="text-3xl font-bold text-foreground font-body tracking-tight">{prefix}{displayValue}{typeof value === "number" ? suffix : ""}</div>
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>{caption}</span>
        </div>
      </div>
    </div>
  );
}
