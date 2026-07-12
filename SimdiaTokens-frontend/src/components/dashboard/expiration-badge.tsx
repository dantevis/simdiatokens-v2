"use client";

import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExpirationBadge({ expiresAt }: { expiresAt: string }) {
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  const isExpired = daysLeft <= 0;
  const isUrgent = daysLeft > 0 && daysLeft <= 3;
  const isWarning = daysLeft > 3 && daysLeft <= 7;

  if (isExpired) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Expired</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium",
      isUrgent && "bg-red-500/10 border-red-500/20 text-red-400",
      isWarning && "bg-amber-500/10 border-amber-500/20 text-amber-400",
      !isUrgent && !isWarning && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    )}>
      <Clock className="h-3.5 w-3.5" />
      <span>{daysLeft} day{daysLeft !== 1 ? "s" : ""} left</span>
    </div>
  );
}