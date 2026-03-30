import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  ShieldAlert,
  Megaphone,
  Bot,
  Puzzle,
  Headphones,
  BarChart3,
  DollarSign,
  Store,
  Settings,
  CalendarCheck,
  Globe,
  LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import callixisLogo from "@/assets/callixis-logo.png";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, role, hasPermission } = useAuth();

  const [gmtTime, setGmtTime] = useState("");

  const isAdmin = role === "admin";

  const allNavItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, permission: "dashboard" },
    { title: "Admin", url: "/admin", icon: ShieldAlert, isAdminOnly: true },
    { title: "Campaigns", url: "/campaigns", icon: Megaphone, permission: "campaigns" },
    { title: "AI Agents", url: "/ai-agents", icon: Bot, permission: "ai-agents" },
    { title: "Plugins", url: "/plugins", icon: Puzzle, permission: "plugins" },
    { title: "Call Center", url: "/call-center", icon: Headphones, permission: "call-center" },
    { title: "Reports", url: "/reports", icon: BarChart3, permission: "reports" },
    { title: "Finance", url: "/finance", icon: DollarSign, permission: "finance" },
    { title: "Marketplace", url: "/marketplace", icon: Store, permission: "marketplace" },
    { title: "Calendar", url: "/calendar", icon: CalendarCheck, permission: "calendar" },
    { title: "Settings", url: "/settings", icon: Settings, permission: "settings" },
  ];

  const navItems = allNavItems.filter(item => {
    if (item.isAdminOnly) return isAdmin;
    if (item.permission) return hasPermission(item.permission);
    return true;
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setGmtTime(
        now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        {/* Brand */}
        <div className={`flex flex-col px-4 py-5 ${collapsed ? "items-center" : ""}`}>
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <img src={callixisLogo} alt="Callixis" width={32} height={32} />
            {!collapsed && (
              <span className="text-lg font-display tracking-tight text-foreground">
                Callixis<span className="text-gradient-cyan">-AI</span>
              </span>
            )}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1.5 mt-1.5 pl-[44px]">
              <Globe className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-mono text-muted-foreground tracking-wide">
                GMT 0 · {gmtTime}
              </span>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 mr-2 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User & Logout */}
        <div className="mt-auto px-4 py-4 border-t border-sidebar-border">
          {!collapsed && (
            <div className="mb-3 px-2">
              <p className="text-xs font-medium text-foreground truncate">{profile?.full_name || "User"}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{role || "—"}</p>
            </div>
          )}
          <button
            onClick={async () => { await signOut(); navigate("/login"); }}
            className="flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
