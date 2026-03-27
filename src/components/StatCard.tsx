import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  icon: LucideIcon;
}

const StatCard = ({ title, value, change, changeType, icon: Icon }: StatCardProps) => {
  const changeColor = changeType === "up" ? "text-primary" : changeType === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="bg-card rounded-lg border border-border p-5 glow-cyan hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <p className={`text-xs mt-1 ${changeColor}`}>{change}</p>
    </div>
  );
};

export default StatCard;
