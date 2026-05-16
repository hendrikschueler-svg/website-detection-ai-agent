import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "../app-sidebar";
import { AlertTriangle } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const sidebarStyle = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      <SidebarProvider style={sidebarStyle}>
        <div className="flex flex-1 w-full overflow-hidden relative">
          <AppSidebar />
          
          <div className="flex-1 flex flex-col min-w-0 bg-secondary/30">
            <header className="h-14 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-4 sticky top-0 z-40">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
              <div className="ml-auto flex items-center gap-4">
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-sm font-bold shadow-sm">
                  JD
                </div>
              </div>
            </header>
            
            <main className="flex-1 overflow-auto p-4 md:p-8 relative">
              <div className="max-w-6xl mx-auto pb-16">
                {children}
              </div>
            </main>

            {/* Global Disclaimer Banner in Footer */}
            <footer className="border-t border-border/50 bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-center gap-3 z-40 sticky bottom-0">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs sm:text-sm text-amber-800 font-medium text-center">
                <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-200 px-1.5 py-0.5 rounded mr-1.5">Demo</span>
                This tool provides an automated risk recommendation and is NOT legal advice. Results may be inaccurate. Human review required.
              </p>
            </footer>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
