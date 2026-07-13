"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function ExpirationBadge() {
  const { user } = useAuth();
  const [badge, setBadge] = useState<JSX.Element | null>(null);

  useEffect(() => {
    if (!user || user.super_admin || !user.expires_at) {
      setBadge(null);
      return;
    }

    const daysLeft = Math.ceil((new Date(user.expires_at).getTime() - Date.now()) / 86400000);
    const isExpired = daysLeft <= 0;
    const isUrgent = daysLeft > 0 && daysLeft <= 3;
    const isWarning = daysLeft > 3 && daysLeft <= 7;

    if (isExpired) {
      setBadge(
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          <span className="text-xs font-medium">Expired</span>
        </div>
      );
      return;
    }

    setBadge(
      <div className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium",
        isUrgent && "bg-red-500/10 border-red-500/20 text-red-400",
        isWarning && "bg-amber-500/10 border-amber-500/20 text-amber-400",
        !isUrgent && !isWarning && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      )}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>{daysLeft} day{daysLeft !== 1 ? "s" : ""} left</span>
      </div>
    );
  }, [user]);

  return badge;
}