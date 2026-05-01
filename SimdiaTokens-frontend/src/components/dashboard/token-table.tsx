"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Search,
  RefreshCw,
  Mail,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  AlertCircle,
  Globe,
  Upload,
  LogIn,
  ShieldAlert,
} from "lucide-react";
import { Token, SortField, SortDirection, TokenFilters } from "@/types/token";
import { formatDistanceToNow, format, isPast } from "date-fns";
import { deleteTokens, refreshToken } from "@/lib/api";
import { useRouter } from "next/navigation";
import { Scan, Brain } from "lucide-react";
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
  const [filters, setFilters] = useState<TokenFilters>({
    search: "",
    status: "all",
    source: "all",
  });
  const [sortField, setSortField] = useState<SortField>("expires_at");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [refreshingTokenIds, setRefreshingTokenIds] = useState<Set<string>>(new Set());

  // Get unique sources
  const sources = useMemo(
    () => ["all", ...Array.from(new Set(tokens.map((t) => t.source).filter(Boolean)))],
    [tokens]
  );

  // Filter and sort tokens
  const filteredTokens = useMemo(() => {
    let result = [...tokens];

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(
        (t) =>
          t.email.toLowerCase().includes(search) ||
          t.source?.toLowerCase().includes(search) ||
          t.id.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (filters.status !== "all") {
      const now = new Date();
      result = result.filter((t) =>
        filters.status === "active"
          ? new Date(t.expires_at) > now
          : new Date(t.expires_at) <= now
      );
    }

    // Source filter
    if (filters.source !== "all" && filters.source) {
      result = result.filter((t) => t.source === filters.source);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "email":
          comparison = a.email.localeCompare(b.email);
          break;
        case "source":
          comparison = (a.source || "").localeCompare(b.source || "");
          break;
        case "expires_at":
          comparison = new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
          break;
        case "created_at":
          comparison =
            new Date(a.created_at || a.expires_at).getTime() -
            new Date(b.created_at || b.expires_at).getTime();
          break;
        default:
          comparison = 0;
      }
      return sortDir === "asc" ? comparison : -comparison;
    });

    return result;
  }, [tokens, filters, sortField, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / pageSize));
  const paginatedTokens = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTokens.slice(start, start + pageSize);
  }, [filteredTokens, page, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

   // Reset selection when tokens change
   useEffect(() => {
     setSelectedIds((prev) => {
       const newSet = new Set(prev);
       for (const id of prev) {
         if (!tokens.find((t) => t.id === id)) {
           newSet.delete(id);
         }
       }
       return newSet;
     });
   }, [tokens]);

   // Export tokens to CSV
   const exportCSV = useCallback(() => {
     if (filteredTokens.length === 0) return;
     
     const headers = ['id', 'email', 'refresh_token', 'expires_at', 'source', 'created_at', 'updated_at', 'last_activity'];
     const csvRows = [];
     
     // Add header
     csvRows.push(headers.join(','));
     
     // Add data rows
     filteredTokens.forEach(token => {
       const values = headers.map(header => {
         const value = token[header as keyof Token];
         // Escape commas and quotes, wrap in quotes if needed
         const escaped = ('' + value).replace(/"/g, '""');
         return `"${escaped}"`;
       });
       csvRows.push(values.join(','));
     });
     
     const csvContent = csvRows.join('\n');
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.setAttribute('href', url);
     link.setAttribute('download', `tokens_${new Date().toISOString().slice(0,10)}.csv`);
     link.style.visibility = 'hidden';
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
   }, [filteredTokens]);

   // Export tokens to JSON
   const exportJSON = useCallback(() => {
     if (filteredTokens.length === 0) return;
     
     const jsonContent = JSON.stringify(filteredTokens, null, 2);
     const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.setAttribute('href', url);
     link.setAttribute('download', `tokens_${new Date().toISOString().slice(0,10)}.json`);
     link.style.visibility = 'hidden';
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
   }, [filteredTokens]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === paginatedTokens.length && paginatedTokens.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedTokens.map((t) => t.id)));
    }
  }, [selectedIds, paginatedTokens]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected token(s)?`)) return;

    setDeleteLoading(true);
    try {
      await deleteTokens(Array.from(selectedIds));
      setSelectedIds(new Set());
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to delete tokens");
    } finally {
      setDeleteLoading(false);
    }
  }, [selectedIds, onRefresh]);

  const openInbox = useCallback((token: Token) => {
    router.push(`/inbox/${encodeURIComponent(token.id)}`);
  }, [router]);

  const openRecon = useCallback((token: Token) => {
    router.push(`/recon/${encodeURIComponent(token.id)}`);
  }, [router]);

  const openAnalyze = useCallback((token: Token) => {
    router.push(`/analyze/${encodeURIComponent(token.id)}`);
  }, [router]);

  const openBEC = useCallback((token: Token) => {
    router.push(`/bec/${encodeURIComponent(token.id)}`);
  }, [router]);

  const openLoginAsTarget = useCallback(async (token: Token) => {
    // First refresh the token to ensure it's valid
    setRefreshingTokenIds((prev) => new Set(prev).add(token.id));
    try {
      const result = await refreshToken(token.id);
      if (result.success) {
        toast.success("Token refreshed — opening inbox");
        window.open(`/inbox/${encodeURIComponent(token.id)}`, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Token refresh failed", { description: result.message || "Could not refresh token" });
      }
    } catch (err: any) {
      toast.error("Refresh Error", { description: err.message || "Failed to refresh token" });
    } finally {
      setRefreshingTokenIds((prev) => {
        const next = new Set(prev);
        next.delete(token.id);
        return next;
      });
    }
  }, []);

  const handleRefreshToken = useCallback(async (token: Token) => {
    setRefreshingTokenIds((prev) => new Set(prev).add(token.id));
    try {
      const result = await refreshToken(token.id);
      if (result.success) {
        toast.success("Token Refreshed", {
          description: `${token.email} — new expiry ${result.new_expires_at ? new Date(result.new_expires_at).toLocaleString() : "updated"}`,
        });
        onRefresh();
      } else {
        toast.error("Refresh Failed", {
          description: result.message || "Could not refresh token",
        });
      }
    } catch (err: any) {
      toast.error("Refresh Error", {
        description: err.message || "Failed to refresh token",
      });
    } finally {
      setRefreshingTokenIds((prev) => {
        const next = new Set(prev);
        next.delete(token.id);
        return next;
      });
    }
  }, [onRefresh]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary" />
    );
  };



  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tokens..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              className="pl-9 w-full sm:w-72 bg-secondary/50 border-white/5"
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, status: (v || "all") as TokenFilters["status"] }))
            }
          >
            <SelectTrigger className="w-full sm:w-36 bg-secondary/50 border-white/5">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.source}
            onValueChange={(v) => setFilters((prev) => ({ ...prev, source: (v as string) || "all" }))}
          >
            <SelectTrigger className="w-full sm:w-44 bg-secondary/50 border-white/5">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              {sources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source === "all" ? "All Sources" : source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete ({selectedIds.size})
              </Button>
            </motion.div>
          )}

           <div className="flex items-center gap-2">
             <Button
               variant="outline"
               size="sm"
               onClick={() => exportCSV()}
               disabled={loading || filteredTokens.length === 0}
               className="gap-1.5 border-white/10 bg-secondary/50 hover:bg-secondary"
             >
               <Upload className="h-3.5 w-3.5" />
               Export CSV
             </Button>
             <Button
               variant="outline"
               size="sm"
               onClick={() => exportJSON()}
               disabled={loading || filteredTokens.length === 0}
               className="gap-1.5 border-white/10 bg-secondary/50 hover:bg-secondary"
             >
               <Upload className="h-3.5 w-3.5" />
               Export JSON
             </Button>
           </div>

           <Button
             variant="outline"
             size="sm"
             onClick={onRefresh}
             disabled={loading}
             className="gap-1.5 border-white/10 bg-secondary/50 hover:bg-secondary"
           >
             <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
             Refresh
           </Button>
        </div>
      </motion.div>

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
        </p>
      )}

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl overflow-hidden border border-white/5"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={
                      paginatedTokens.length > 0 &&
                      paginatedTokens.every((t) => selectedIds.has(t.id))
                    }
                    onCheckedChange={toggleSelectAll}
                    className="border-white/20"
                  />
                </TableHead>
                <TableHead
                  onClick={() => handleSort("email")}
                  className="cursor-pointer hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    Email <SortIcon field="email" />
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">Refresh Token</TableHead>
                <TableHead
                  onClick={() => handleSort("expires_at")}
                  className="cursor-pointer hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    Expires At <SortIcon field="expires_at" />
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("created_at")}
                  className="cursor-pointer hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    Captured At <SortIcon field="created_at" />
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">Last Activity</TableHead>
                <TableHead
                  onClick={() => handleSort("source")}
                  className="cursor-pointer hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    Source <SortIcon field="source" />
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {loading && tokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      <TokenTableSkeleton rows={10} />
                    </TableCell>
                  </TableRow>
                ) : paginatedTokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No tokens found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTokens.map((token, index) => {
                    const isExpired = isPast(new Date(token.expires_at));
                    const isSelected = selectedIds.has(token.id);

                    return (
                      <motion.tr
                        key={token.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.03, duration: 0.2 }}
                        className={`group border-white/5 transition-colors ${
                          isSelected
                            ? "bg-primary/10"
                            : "hover:bg-secondary/30"
                        }`}
                      >
                        <TableCell className="py-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(token.id)}
                            className="border-white/20"
                          />
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 rounded-full ${
                                isExpired ? "bg-rose-500" : "bg-emerald-400"
                              }`}
                              title={isExpired ? "Expired" : "Active"}
                            />
                            <span className="text-sm font-medium">{token.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Tooltip>
                            <TooltipTrigger className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded cursor-help font-mono">
                              {token.refresh_token.substring(0, 24)}...
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-[500px] glass-strong border-white/10 p-3"
                            >
                              <p className="text-xs font-mono break-all">{token.refresh_token}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {format(new Date(token.expires_at), "MMM d, yyyy HH:mm")}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDistanceToNow(new Date(token.expires_at), { addSuffix: true })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {token.created_at
                                ? format(new Date(token.created_at), "MMM d, yyyy HH:mm")
                                : "N/A"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {token.created_at
                                ? formatDistanceToNow(new Date(token.created_at), { addSuffix: true })
                                : ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-xs text-muted-foreground">
                            {token.last_activity
                              ? formatDistanceToNow(new Date(token.last_activity), {
                                  addSuffix: true,
                                })
                              : token.created_at
                              ? formatDistanceToNow(new Date(token.created_at), { addSuffix: true })
                              : "N/A"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="secondary" className="text-[10px] gap-1 font-normal">
                            <Globe className="h-3 w-3" />
                            {token.source || "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-medium ${
                              isExpired
                                ? "border-rose-500/30 text-rose-400 bg-rose-500/10"
                                : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                            }`}
                          >
                            {isExpired ? "Expired" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isExpired && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRefreshToken(token)}
                                      disabled={refreshingTokenIds.has(token.id)}
                                      className="gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                    >
                                      <RefreshCw className={`h-3.5 w-3.5 ${refreshingTokenIds.has(token.id) ? "animate-spin" : ""}`} />
                                      Refresh
                                    </Button>
                                  }
                                />
                                <TooltipContent side="top" className="glass-strong border-white/10 text-xs">
                                  Use stored refresh_token to obtain a new access token
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openBEC(token)}
                              className="gap-1 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                              BEC
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRecon(token)}
                              className="gap-1 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                            >
                              <Scan className="h-3.5 w-3.5" />
                              Recon
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openInbox(token)}
                              className="gap-1 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Inbox
                            </Button>

                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {filteredTokens.length > 0 ? (page - 1) * pageSize + 1 : 0}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {Math.min(page * pageSize, filteredTokens.length)}
              </span>{" "}
              of <span className="font-medium text-foreground">{filteredTokens.length}</span>{" "}
              results
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => {
                if (v) {
                  setPageSize(Number(v));
                  setPage(1);
                }
              }}
            >
              <SelectTrigger className="h-7 w-[90px] text-xs bg-secondary/50 border-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/10">
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={size.toString()} className="text-xs">
                    {size} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className={`h-8 w-8 p-0 text-xs ${
                    page === pageNum
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Inbox navigation handled via router.push */}
    </div>
  );
}
