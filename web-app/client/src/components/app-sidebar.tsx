import { Link, useLocation } from "wouter";
import { 
  Search, 
  List, 
  ShieldAlert, 
  Activity
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const [location] = useLocation();

  const navItems = [
    {
      title: "New Search",
      url: "/",
      icon: Search,
      disabled: false,
    },
    {
      title: "Latest Results",
      url: "/results",
      icon: List,
      disabled: false,
    },
    {
      title: "Takedowns (coming soon)",
      url: "#",
      icon: ShieldAlert,
      disabled: true,
    },
  ];

  return (
    <Sidebar className="border-r border-border/50 bg-sidebar">
      <SidebarHeader className="p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">IP Risk Scanner</h2>
            <p className="text-xs text-muted-foreground">Automated Discovery</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Workflows
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url === "/results" && location.startsWith("/results"));
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      disabled={item.disabled}
                      data-active={isActive}
                      className={`
                        transition-all duration-200
                        ${isActive ? "bg-primary/5 text-primary font-medium" : "text-muted-foreground"}
                        ${item.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"}
                      `}
                    >
                      {item.disabled ? (
                        <div className="flex items-center gap-3 px-3 py-2 cursor-not-allowed">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </div>
                      ) : (
                        <Link href={item.url} className="flex items-center gap-3 px-3 py-2">
                          <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                          <span>{item.title}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50">
        <div className="rounded-xl bg-muted/50 p-4 text-xs">
          <p className="font-semibold text-foreground mb-1">Demo Environment</p>
          <p className="text-muted-foreground leading-relaxed">
            Connected to sandbox analytics.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
