import {
  Phone,
  Users,
  TrendingUp,
  DollarSign,
  Bot,
  Clock,
  PhoneCall,
  Target,
  ListChecks,
  AreaChart,
  PieChart,
  BarChart3,
  Radio,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { TileIconName } from "@/lib/dashboardTiles";

// The one place allowed to turn a TileMeta.icon NAME into a real lucide component — keeps
// src/lib/dashboardTiles.ts itself free of runtime imports (§D's "import type only" rule).
export const TILE_ICON_MAP: Record<TileIconName, LucideIcon> = {
  Phone,
  Users,
  TrendingUp,
  DollarSign,
  Bot,
  Clock,
  PhoneCall,
  Target,
  ListChecks,
  AreaChart,
  PieChart,
  BarChart3,
  Radio,
  Sparkles,
};
