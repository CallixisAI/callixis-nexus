import { useState, useEffect } from "react";
import { Globe, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { APP_PERMISSIONS } from "@/lib/permissions";
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
  const navigate = useNavigate();
  const { signOut, profile, role, hasPermission } = useAuth();

  const [gmtTime, setGmtTime] = useState("");

  // Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §A/§D): the nav list used to
  // be a second, hand-maintained copy of Admin.tsx's APP_FEATURES [E14], and the Admin item
  // was gated on a hardcoded role string (isAdminOnly) instead of a permission [E7]-adjacent
  // in spirit. Both are gone — one shared catalogue, one gate (hasPermission), same source
  // ProtectedRoute reads (src/lib/access.ts), so the sidebar and the route guard cannot
  // disagree about what a user can reach.
  const navItems = APP_PERMISSIONS.filter((item) => hasPermission(item.key));

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
            <img src={callixisLogo} alt="CalliXis AI" width={32} height={32} />
            {!collapsed && (
              <span className="text-lg font-display tracking-tight text-foreground">
                CalliXis<span className="text-gradient-cyan">-AI</span>
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
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.route}
                      end={item.route === "/dashboard"}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 mr-2 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
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
