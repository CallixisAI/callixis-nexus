import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TimeframePreset = "today" | "7d" | "30d" | "90d" | "ytd" | "custom";

interface TimeframeFilterProps {
  value: TimeframePreset;
  onChange: (preset: TimeframePreset) => void;
  customRange?: { from?: Date; to?: Date };
  onCustomRangeChange?: (range: { from?: Date; to?: Date }) => void;
  compact?: boolean;
}

const presets: { value: TimeframePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "ytd", label: "YTD" },
];

export function TimeframeFilter({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  compact = false,
}: TimeframeFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const activeLabel = value === "custom" && customRange?.from
    ? `${format(customRange.from, "MMM d")}${customRange.to ? ` – ${format(customRange.to, "MMM d")}` : ""}`
    : presets.find((p) => p.value === value)?.label || "Select";

  return (
    <div className="flex items-center gap-1.5">
      {!compact && (
        <Clock className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
      )}
      <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
        {presets.map((preset) => (
          <Button
            key={preset.value}
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 px-2.5 text-xs rounded-md transition-all",
              value === preset.value
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </Button>
        ))}

        {/* Custom date range */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 px-2.5 text-xs rounded-md transition-all gap-1",
                value === "custom"
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              {value === "custom" ? activeLabel : "Custom"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
              onSelect={(range) => {
                onCustomRangeChange?.({ from: range?.from, to: range?.to });
                onChange("custom");
                if (range?.from && range?.to) {
                  setCalendarOpen(false);
                }
              }}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {value !== "today" && (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
          {activeLabel}
        </Badge>
      )}
    </div>
  );
}
