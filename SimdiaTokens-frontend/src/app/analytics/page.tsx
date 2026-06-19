"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { usePollingApi } from "@/lib/polling";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  Activity,
  Shield,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Globe,
  Clock,
  Loader2,
  TrendingUp,
  Users,
  Zap,
  FileText,
  ChevronDown,
  Calendar,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

import { AnalyticsOverview, TokenHealthResponse } from "@/types/token";
import { fetchAnalyticsOverview, fetchTokenHealth } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardTopBar } from "@/components/dashboard/top-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DateRange = "24h" | "7d" | "30d" | "custom";

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/5 bg-secondary/10 p-4 flex items-center gap-4"
    >
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
    </motion.div>
  );
}

function StatusBadge({ success }: { success: boolean }) {
  return success ? (
    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Success
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/20">
      <AlertTriangle className="h-3 w-3 mr-1" />
      Failed
    </Badge>
  );
}



export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const dateParams = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "24h":
        return {
          from: startOfDay(subDays(now, 1)).toISOString(),
          to: endOfDay(now).toISOString(),
        };
      case "7d":
        return {
          from: startOfDay(subDays(now, 7)).toISOString(),
          to: endOfDay(now).toISOString(),
        };
      case "30d":
        return {
          from: startOfDay(subDays(now, 30)).toISOString(),
          to: endOfDay(now).toISOString(),
        };
      case "custom":
        return {
          from: customFrom ? new Date(customFrom).toISOString() : undefined,
          to: customTo ? new Date(customTo).toISOString() : undefined,
        };
    }
  }, [dateRange, customFrom, customTo]);

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
    refetch: refetchAnalytics,
    isPolling: analyticsPolling,
  } = usePollingApi<AnalyticsOverview>({
    queryKey: ["analytics", dateParams],
    queryFn: () => fetchAnalyticsOverview(dateParams.from, dateParams.to),
    intervalMs: 60_000,
  });

  const {
    data: health,
    isLoading: healthLoading,
  } = usePollingApi<TokenHealthResponse>({
    queryKey: ["token-health"],
    queryFn: fetchTokenHealth,
    intervalMs: 60_000,
  });

  const data = analytics;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DashboardTopBar
        title="Analytics & Telemetry"
        subtitle="Operational intelligence, audit trails, and token health"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {analyticsLoading && !analytics ? (
            <div className="flex items-center justify-center py-24 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading analytics...</p>
            </div>
          ) : analyticsError && !analytics ? (
            <div className="flex items-center justify-center py-24 gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              <p className="text-sm text-muted-foreground">Failed to load analytics</p>
            </div>
          ) : (
            <>
          {/* Date Range Filter */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Date Range</span>
            </div>
            <div className="flex items-center rounded-lg bg-secondary/50 border border-white/5 p-0.5">
              {(["24h", "7d", "30d", "custom"] as DateRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[11px] font-medium transition-all",
                    dateRange === r
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r === "24h" ? "Last 24h" : r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : "Custom"}
                </button>
              ))}
            </div>
            {dateRange === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 rounded-lg border border-white/10 bg-secondary/50 px-2.5 text-xs text-foreground outline-none"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 rounded-lg border border-white/10 bg-secondary/50 px-2.5 text-xs text-foreground outline-none"
                />
                <Button size="sm" className="h-8" onClick={() => refetchAnalytics()}>
                  Apply
                </Button>
              </div>
            )}
          </motion.div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Active Tokens"
              value={health?.active ?? data?.kpi.active_tokens ?? 0}
              icon={Shield}
              color="bg-emerald-500/20"
              subtitle={`${health?.total ?? (data?.kpi.active_tokens ?? 0) + (data?.kpi.revoked_tokens ?? 0)} total`}
            />
            <KpiCard
              title="Revoked Tokens"
              value={health?.revoked ?? data?.kpi.revoked_tokens ?? 0}
              icon={AlertTriangle}
              color="bg-rose-500/20"
            />
            <KpiCard
              title="Total Campaigns"
              value={data?.kpi.total_campaigns ?? 0}
              icon={Zap}
              color="bg-primary/20"
            />
            <KpiCard
              title="Rules Created (30d)"
              value={data?.kpi.rules_created_30d ?? 0}
              icon={FileText}
              color="bg-amber-500/20"
            />
          </div>

          {/* Token Health & System Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Token Health Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-xl border border-white/5 bg-secondary/10 p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">Token Health</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs text-muted-foreground">Active</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400">{health?.active ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="text-xs text-muted-foreground">Expired</span>
                  </div>
                  <span className="text-sm font-bold text-amber-400">{health?.expired ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="text-xs text-muted-foreground">Revoked</span>
                  </div>
                  <span className="text-sm font-bold text-rose-400">{health?.revoked ?? 0}</span>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-sm font-bold text-foreground">{health?.total ?? 0}</span>
                  </div>
                  {health && health.total > 0 && (
                    <div className="mt-2">
                      <div className="flex h-2 rounded-full overflow-hidden bg-secondary/50">
                        <div className="bg-emerald-400" style={{ width: `${(health.active / health.total) * 100}%` }} />
                        <div className="bg-amber-400" style={{ width: `${(health.expired / health.total) * 100}%` }} />
                        <div className="bg-rose-400" style={{ width: `${(health.revoked / health.total) * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {health.total > 0 ? `${((health.active / health.total) * 100).toFixed(0)}% operational` : "No tokens"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Success Rate */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl border border-white/5 bg-secondary/10 p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">Operation Success Rate</h3>
              </div>
              <div className="space-y-3">
                {(() => {
                  const activities = data?.recent_activity ?? [];
                  const total = activities.length;
                  const success = activities.filter(a => a.success).length;
                  const failed = total - success;
                  const rate = total > 0 ? ((success / total) * 100).toFixed(0) : "—";
                  return (
                    <>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-emerald-400">{rate}{rate !== "—" ? "%" : ""}</p>
                        <p className="text-[10px] text-muted-foreground">Success rate (last {total} ops)</p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-400">{success} succeeded</span>
                        <span className="text-rose-400">{failed} failed</span>
                      </div>
                      {total > 0 && (
                        <div className="flex h-2 rounded-full overflow-hidden bg-secondary/50">
                          <div className="bg-emerald-400" style={{ width: `${(success / total) * 100}%` }} />
                          <div className="bg-rose-400" style={{ width: `${(failed / total) * 100}%` }} />
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>

            {/* OPSEC Status */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl border border-white/5 bg-secondary/10 p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-foreground">OPSEC Status</h3>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Auto-delete rules</span>
                  <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fingerprint cloning</span>
                  <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Sent items cleanup</span>
                  <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Token auto-refresh</span>
                  <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {health?.active ?? 0} tokens
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rules created</span>
                  <span className="text-xs font-semibold text-foreground">{data?.kpi.rules_created_30d ?? 0} (30d)</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Token Timeline Line Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl border border-white/5 bg-secondary/10 p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Token Activity Over Time</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.token_timeline ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} stroke="rgba(255,255,255,0.1)" />
                    <YAxis tick={{ fontSize: 11, fill: "#888" }} stroke="rgba(255,255,255,0.1)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1d24",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="created" name="Created" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="revoked" name="Revoked" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Action Distribution Bar Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl border border-white/5 bg-secondary/10 p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-foreground">Action Distribution</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.action_distribution ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#888" }} stroke="rgba(255,255,255,0.1)" />
                    <YAxis
                      dataKey="action"
                      type="category"
                      tick={{ fontSize: 11, fill: "#888" }}
                      stroke="rgba(255,255,255,0.1)"
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1d24",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="count" name="Count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {/* Bottom Row: Activity Feed + Domains */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Activity */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl border border-white/5 bg-secondary/10 overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {data?.recent_activity?.length ?? 0} entries
                </span>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {analyticsLoading && !analytics ? (
                  <div className="flex items-center justify-center py-12 gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loading activity...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.03]">
                    {data?.recent_activity?.map((log, i) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="px-5 py-3 hover:bg-secondary/20 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusBadge success={log.success} />
                            <span className="text-xs font-medium text-foreground capitalize truncate">
                              {log.action.replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {format(new Date(log.timestamp), "MMM d, HH:mm")}
                          </span>
                        </div>
                        {log.campaign_id && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Campaign: {log.campaign_id}
                          </p>
                        )}
                        {log.user_email && (
                          <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                            {log.user_email}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Top Domains */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-xl border border-white/5 bg-secondary/10 overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">Top Target Domains</h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase tracking-wider">Domain</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-right">Tokens</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.top_domains?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                          No domain data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.top_domains?.map((d, i) => {
                        const total = data?.top_domains?.reduce((acc, x) => acc + x.count, 0) ?? 0;
                        const share = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0";
                        return (
                          <TableRow key={d.domain} className="border-white/5">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-foreground">{d.domain}</span>
                                {i === 0 && (
                                  <Badge variant="secondary" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                                    Top
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-semibold text-foreground">{d.count}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${share}%` }}
                                    transition={{ duration: 0.5, delay: i * 0.05 }}
                                    className="h-full rounded-full bg-emerald-400"
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-8 text-right">{share}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          </div>
        </>
      )}
        </div>
      </div>
    </div>
  );
}
