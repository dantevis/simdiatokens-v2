"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useTheme, ThemeToggleIcon } from "@/components/ui/theme-provider";
import { Search, User, LogOut, Settings, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ExpirationBadge } from "@/components/dashboard/expiration-badge";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const { theme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [children]);

  return (
    <div className="flex h-full w-full">
      {/* Desktop sidebar — hidden on login page to avoid hydration mismatch */}
      <div className={cn("hidden lg:block", isLoginPage && "lg:hidden")}>
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && isMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-50 lg:hidden"
            >
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 w-full">
        {/* Top bar — hidden on login page */}
        <header
          className={cn(
            "sticky top-0 z-40 flex items-center justify-between gap-4 h-14 px-4 sm:px-6 lg:px-8 glass-strong border-b border-border/50",
            isLoginPage && "hidden"
          )}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mobile hamburger */}
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="flex items-center gap-2 text-xs text-foreground"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              </button>
            )}

            {/* Global search */}
            <div className="relative max-w-md w-full hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search tokens, campaigns, emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <ExpirationBadge />
            {/* Notifications */}
            <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-background" />
            </button>

            {/* Theme toggle */}
            <ThemeToggleIcon className="h-8 w-8" />

            {/* User avatar dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 h-8 px-2 rounded-lg hover:bg-secondary/40 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/10 flex items-center justify-center ring-1 ring-primary/30">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="hidden md:block text-xs font-medium text-foreground">{user?.username || "Guest"}</span>
              </button>

              <AnimatePresence>
                {userDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-popover border border-border shadow-xl z-50 py-1"
                    >
                      <div className="px-3 py-2 border-b border-border">
                        <p className="text-sm font-medium text-foreground">{user?.username || "Guest"}</p>
                        <p className="text-xs text-muted-foreground capitalize">{user?.role || "unknown"}</p>
                      </div>
                      <a
                        href="/settings"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/40 transition-colors"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        Settings
                      </a>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          logout();
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <AuthGuard>{children}</AuthGuard>
      </main>
    </div>
  );
}


