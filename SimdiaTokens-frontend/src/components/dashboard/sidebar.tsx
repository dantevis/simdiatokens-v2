"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  KeyRound,
  Mail,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  User,
  Activity,
  FolderKanban,
  BarChart3,
  Target,
  Scan,
  Brain,
  Sun,
  Moon,
  Fish,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/ui/theme-provider";
import { useAuth } from "@/hooks/use-auth";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  minRole: "viewer" | "operator" | "admin";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const allNavSections: NavSection[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, minRole: "viewer" },
      { label: "Tokens", href: "/tokens", icon: KeyRound, minRole: "operator" },
      { label: "Inbox", href: "/inbox", icon: Mail, minRole: "operator" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Recon", href: "/recon", icon: Scan, minRole: "viewer" },
      { label: "Campaigns", href: "/campaigns", icon: Target, minRole: "operator" },
      { label: "Lure", href: "/lure", icon: Fish, minRole: "operator" },
      { label: "Analytics", href: "/analytics", icon: BarChart3, minRole: "viewer" },
    ],
  },
];

const allBottomItems: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings, minRole: "admin" },
  { label: "Activity Log", href: "/activity", icon: Activity, minRole: "admin" },
  { label: "Super Admin", href: "/super-admin", icon: Shield, minRole: "admin" },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const { user, hasRole } = useAuth();

  const roleOrder = ["viewer", "operator", "admin"] as const;
  const userRoleIdx = user ? roleOrder.indexOf(user.role) : -1;

  const filterItems = (items: NavItem[]) =>
    items.filter((item) => userRoleIdx >= roleOrder.indexOf(item.minRole));

  const navSections: NavSection[] = allNavSections.map((s) => ({
    ...s,
    items: filterItems(s.items),
  }));

  const bottomSection: NavSection = {
    label: "System",
    items: filterItems(allBottomItems),
  };

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const renderNavSection = (section: NavSection) => (
    <div key={section.label} className="space-y-1">
      {!collapsed && (
        <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {section.label}
        </p>
      )}
      {section.items.map((item) => {
        const active = isActive(item.href);
          return collapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger
                render={
                  <Link
                    href={item.href}
                    onClick={() => onNavigate?.()}
                    className={cn(
                      buttonVariants({ variant: active ? "secondary" : "ghost", size: "default" }),
                      "w-full justify-center relative",
                      active && "bg-primary/10 text-primary hover:bg-primary/15"
                    )}
                    tabIndex={0}
                  >
                  <item.icon className={cn("h-[18px] w-[18px]", active ? "text-primary" : "text-muted-foreground")} />
                  {item.badge && (
                    <span className="absolute top-1 right-1.5 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                    </span>
                  )}
                </Link>
              }
            />
            <TooltipContent side="right" className="glass-strong border-white/10 text-xs">
              {item.label}
              {item.badge && <span className="ml-1.5 text-primary">{item.badge}</span>}
            </TooltipContent>
          </Tooltip>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={cn(
                buttonVariants({ variant: active ? "secondary" : "ghost", size: "default" }),
                "w-full justify-start gap-3 h-9 rounded-lg transition-all duration-200",
              active
                ? "bg-primary/10 text-primary hover:bg-primary/15 shadow-[inset_0_0_0_1px_rgba(6,182,212,0.1)]"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            )}
          >
            <item.icon className={cn("h-[18px] w-[18px] flex-shrink-0 transition-colors", active ? "text-primary" : "")} />
            <span className="text-[13px] font-medium">{item.label}</span>
            {item.badge && (
              <span className="ml-auto text-[10px] text-primary font-medium">{item.badge}</span>
            )}
            {active && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute right-0 w-[3px] h-5 bg-primary rounded-l-full"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 248 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="relative flex flex-col h-full bg-sidebar border-r border-sidebar-border overflow-hidden"
    >
      {/* Logo */}
      <div       className={cn(
        "flex items-center gap-3 px-4 h-16 border-b border-sidebar-border",
        collapsed && "justify-center px-0"
      )}>
        <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Shield className="h-[18px] w-[18px] text-primary" />
          <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
        </div>
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden"
            >
              <h1 className="text-[15px] font-bold tracking-tight text-foreground whitespace-nowrap">
                Simdia<span className="text-primary">Tokens</span>
              </h1>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto space-y-4">
        {navSections.map(renderNavSection)}
      </nav>

      {/* Bottom sections */}
      <div className="px-2 pb-2">
        <div className="border-t border-sidebar-border pt-1">
          {renderNavSection(bottomSection)}
        </div>

        {/* Theme Toggle */}
        <div className={cn("px-1 py-2", collapsed && "flex justify-center")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={toggleTheme}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                }
              />
              <TooltipContent side="right" className="glass-strong border-border text-xs">
                Switch to {theme === "dark" ? "light" : "dark"} mode
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-all duration-200"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="h-[18px] w-[18px] flex-shrink-0" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="h-[18px] w-[18px] flex-shrink-0" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* User section */}
        <div className={cn("mt-2 px-2 py-3 rounded-xl bg-muted/30 border border-border/30", collapsed && "px-0 bg-transparent border-transparent")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="flex items-center justify-center cursor-pointer">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/10 flex items-center justify-center ring-1 ring-primary/30">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                }
              />
              <TooltipContent side="right" className="glass-strong border-white/10 text-xs">
                {user?.username || "Guest"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/10 flex items-center justify-center ring-1 ring-primary/30 flex-shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[13px] font-medium text-foreground truncate">{user?.username || "Guest"}</p>
                <p className="text-[10px] text-muted-foreground truncate capitalize">{user?.role || "unknown"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition-all hover:border-border z-50"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </motion.aside>
  );
}
