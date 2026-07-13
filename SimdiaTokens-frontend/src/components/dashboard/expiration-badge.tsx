"use client";

import React, { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ExpirationBadge() {
  const { user } = useAuth();

  const info = useMemo(() => {
    if (!user || user.super_admin || !user.expires_at) return null;
    const expiresAt = new Date(user.expires_at);
    const startAt = user.created_at ? new Date(user.created_at) : null;
    const startStr = startAt ? formatDate(user.created_at as string) : null;
    const expiresStr = formatDate(user.expires_at);
    const totalDays = user.usage_days
      ? user.usage_days
      : startAt
        ? Math.ceil((expiresAt.getTime() - startAt.getTime()) / 86400000)
        : null;
    const validityPeriod = [startStr, expiresStr].filter(Boolean).join(" → ");
    const tooltip = [
      validityPeriod ? `Valid: ${validityPeriod}` : null,
      totalDays ? `Period: ${totalDays} day${totalDays !== 1 ? "s" : ""}` : null,
      `Expires: ${expiresStr}`,
    ].filter(Boolean).join(" | ");
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
    return { expiresStr, daysLeft, tooltip };
  }, [user]);

  if (!user || user.super_admin) return null;

  if (!info) {
    return (
      <span
        title="No expiration set on this account"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/40 border border-border text-muted-foreground text-xs font-medium"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>No expiry</span>
      </span>
    );
  }

  const { expiresStr, daysLeft, tooltip } = info;
  const isExpired = daysLeft <= 0;
  const isUrgent = daysLeft > 0 && daysLeft <= 3;
  const isWarning = daysLeft > 3 && daysLeft <= 7;

  if (isExpired) {
    return (
      <div
        title={tooltip}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        <span className="text-xs font-medium">Expired · {expiresStr}</span>
      </div>
    );
  }

  return (
    <div
      title={tooltip}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium",
        isUrgent && "bg-red-500/10 border-red-500/20 text-red-400",
        isWarning && "bg-amber-500/10 border-amber-500/20 text-amber-400",
        !isUrgent && !isWarning && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      )}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>{expiresStr} · {daysLeft}d left</span>
    </div>
  );
}