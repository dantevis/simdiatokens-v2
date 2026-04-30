"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Search,
  Loader2,
  AlertTriangle,
  Plus,
  BarChart3,
  InboxIcon,
  ChevronDown,
  Play,
  X,
} from "lucide-react";
import { format, subDays, isAfter } from "date-fns";

import { Token, StoredAnalysis, AIAnalysisReport } from "@/types/token";
import { fetchTokens, fetchAIAnalyses, triggerAIAnalysis } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useDecryptedData } from "@/hooks/use-decrypted-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DashboardTopBar } from "@/components/dashboard/top-bar";
import { AnalysisCard } from "@/components/ai-analysis/analysis-card";
import { PrefilledRuleModal } from "@/components/ai-analysis/rule-modal";

function SimpleBarChart({ data }: { data: number[] }) {
  const buckets = [
    { label: "0–25%", range: [0, 0.25], count: 0 },
    { label: "25–50%", range: [0.25, 0.5], count: 0 },
    { label: "50–75%", range: [0.5, 0.75], count: 0 },
    { label: "75–100%", range: [0.75, 1], count: 0 },
  ];

  data.forEach((score) => {
    for (const b of buckets) {
      if (score >= b.range[0] && score < b.range[1]) {
        b.count++;
        return;
      }
    }
    // Edge case: score === 1.0 goes in last bucket
    if (score === 1.0) buckets[3].count++;
  });

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="flex items-end gap-3 h-32 px-2">
      {buckets.map((b, i) => {
        const heightPct = (b.count / maxCount) * 100;
        const color =
          i < 1 ? "bg-emerald-400" : i < 2 ? "bg-amber-400" : i < 3 ? "bg-orange-400" : "bg-rose-400";
        return (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground tabular-nums">{b.count}</span>
            <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={cn("w-full max-w-[48px] rounded-t-md", color)}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}



type DateRange = "all" | "7d" | "30d";

export default function AIAnalysisPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [analyses, setAnalyses] = useState<StoredAnalysis[]>([]);
  const [analysesLoading, setAnalysesLoading] = useState(true);
  const [analysesError, setAnalysesError] = useState<string | null>(null);

  const [selectedTokenId, setSelectedTokenId] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // Decrypt sensitive fields
  const { data: decryptedAnalyses } = useDecryptedData(analyses);
  const { data: decryptedTokens } = useDecryptedData(tokens);
  const displayAnalyses = decryptedAnalyses ?? analyses;
  const displayTokens = decryptedTokens ?? tokens;

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newTokenId, setNewTokenId] = useState("");
  const [newMessageCount, setNewMessageCount] = useState(25);
  const [newAnalysisLoading, setNewAnalysisLoading] = useState(false);

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [rulePrefill, setRulePrefill] = useState<{ tokenId: string; ruleName: string; conditionField: "subject" | "sender" | "body"; conditionValue: string } | null>(null);

  const mounted = useRef(false);

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const data = await fetchTokens();
      setTokens(data || []);
    } catch {
      setTokens([]);
    } finally {
      setTokensLoading(false);
    }
  }, []);

  const loadAnalyses = useCallback(async () => {
    setAnalysesLoading(true);
    setAnalysesError(null);
    try {
      const tokenId = selectedTokenId === "all" ? undefined : selectedTokenId;
      const data = await fetchAIAnalyses(tokenId);
      setAnalyses(data || []);
    } catch (err: any) {
      setAnalysesError(err.message || "Failed to load analyses");
      setAnalyses([]);
    } finally {
      setAnalysesLoading(false);
    }
  }, [selectedTokenId]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      loadTokens();
    }
  }, [loadTokens]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  const filteredAnalyses = useMemo(() => {
    let filtered = [...displayAnalyses];

    // Date range filter
    if (dateRange !== "all") {
      const cutoff = subDays(new Date(), dateRange === "7d" ? 7 : 30);
      filtered = filtered.filter((a) => isAfter(new Date(a.created_at), cutoff));
    }

    return filtered;
  }, [analyses, dateRange]);

  const riskScores = useMemo(() => filteredAnalyses.map((a) => a.report.overall_risk_score), [filteredAnalyses]);

  const handleNewAnalysis = async () => {
    if (!newTokenId) return;
    setNewAnalysisLoading(true);
    try {
      await triggerAIAnalysis(newTokenId, newMessageCount);
      setNewModalOpen(false);
      await loadAnalyses();
    } catch (err: any) {
      setAnalysesError(err.message || "Failed to trigger analysis");
    } finally {
      setNewAnalysisLoading(false);
    }
  };

  const handleCreateRule = (analysis: StoredAnalysis, findingIndex: number) => {
    const finding = analysis.report.findings[findingIndex];
    if (!finding) return;
    setRulePrefill({
      tokenId: analysis.token_id,
      ruleName: `AI: ${finding.category.replace(/_/g, " ")} filter`,
      conditionField: finding.category === "sender" ? "sender" : "subject",
      conditionValue: finding.category === "invoice" ? "invoice" : finding.category === "wire_transfer" ? "wire" : finding.summary.slice(0, 30),
    });
    setRuleModalOpen(true);
  };

  const selectedTokenEmail = displayTokens.find((t) => t.id === selectedTokenId)?.email;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DashboardTopBar
        title="AI Analysis Dashboard"
        subtitle="Historical BEC intelligence reports and risk scoring"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setNewModalOpen(true)}>
            <Plus className="h-4 w-4" />
            New Analysis
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Filter Bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Filters</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Token selector */}
              <div className="relative">
                <select
                  value={selectedTokenId}
                  onChange={(e) => setSelectedTokenId(e.target.value)}
                  className="h-8 rounded-lg border border-white/10 bg-secondary/50 px-3 pr-8 text-xs text-foreground outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50 appearance-none cursor-pointer"
                >
                  <option value="all">All Tokens</option>
                  {displayTokens.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.email}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>

              {/* Date range */}
              <div className="flex items-center rounded-lg bg-secondary/50 border border-white/5 p-0.5">
                {(["all", "7d", "30d"] as DateRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setDateRange(r)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                      dateRange === r
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r === "all" ? "All Time" : r === "7d" ? "Last 7 Days" : "Last 30 Days"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="secondary" className="text-[10px]">
                {filteredAnalyses.length} analyses
              </Badge>
            </div>
          </motion.div>

          {/* Chart + Stats */}
          {filteredAnalyses.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div className="md:col-span-1 rounded-xl border border-white/5 bg-secondary/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Risk Distribution</h3>
                </div>
                <SimpleBarChart data={riskScores} />
              </div>

              <div className="md:col-span-2 grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-white/5 bg-secondary/10 p-4 flex flex-col items-center justify-center">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Average Risk</span>
                  <span className="text-2xl font-bold text-foreground mt-1">
                    {riskScores.length > 0
                      ? `${(riskScores.reduce((a, b) => a + b, 0) / riskScores.length * 100).toFixed(0)}%`
                      : "—"}
                  </span>
                </div>
                <div className="rounded-xl border border-white/5 bg-secondary/10 p-4 flex flex-col items-center justify-center">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">High Risk</span>
                  <span className="text-2xl font-bold text-rose-400 mt-1">
                    {riskScores.filter((s) => s > 0.7).length}
                  </span>
                </div>
                <div className="rounded-xl border border-white/5 bg-secondary/10 p-4 flex flex-col items-center justify-center">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Findings</span>
                  <span className="text-2xl font-bold text-primary mt-1">
                    {filteredAnalyses.reduce((acc, a) => acc + a.report.findings.length, 0)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Analyses List */}
          <div className="space-y-4">
            {analysesLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading analyses...</p>
              </div>
            ) : analysesError ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive">{analysesError}</p>
                <Button variant="outline" size="sm" onClick={loadAnalyses}>
                  Retry
                </Button>
              </div>
            ) : filteredAnalyses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="h-16 w-16 rounded-2xl bg-secondary/30 border border-white/5 flex items-center justify-center">
                  <Brain className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-foreground">No analyses found</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedTokenId !== "all"
                      ? `No analyses for ${selectedTokenEmail || "this token"} in the selected date range.`
                      : "No analyses have been run yet. Start your first analysis."}
                  </p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setNewModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New Analysis
                </Button>
              </div>
            ) : (
              <AnimatePresence>
                {filteredAnalyses.map((analysis, i) => (
                  <AnalysisCard
                    key={analysis.id}
                    analysis={analysis}
                    index={i}
                    onCreateRule={handleCreateRule}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* New Analysis Modal */}
      <Dialog open={newModalOpen} onOpenChange={setNewModalOpen}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden glass-strong border-white/10">
          <DialogHeader className="px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">New AI Analysis</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Select a token and message count to analyze
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Token
              </label>
              <div className="relative mt-1.5">
                <select
                  value={newTokenId}
                  onChange={(e) => setNewTokenId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-white/10 bg-secondary/50 px-3 pr-8 text-xs text-foreground outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50 appearance-none cursor-pointer"
                >
                  <option value="">Select a token...</option>
                  {displayTokens.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.email}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Message Count
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                {[10, 25, 50, 100].map((count) => (
                  <button
                    key={count}
                    onClick={() => setNewMessageCount(count)}
                    className={cn(
                      "flex-1 h-9 rounded-lg border text-xs font-medium transition-all",
                      newMessageCount === count
                        ? "bg-primary/20 border-primary/30 text-primary"
                        : "bg-secondary/50 border-white/5 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-white/5">
            <Button type="button" variant="outline" size="sm" onClick={() => setNewModalOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button size="sm" className="gap-1.5" disabled={!newTokenId || newAnalysisLoading} onClick={handleNewAnalysis}>
              {newAnalysisLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Start Analysis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prefilled Rule Modal */}
      {rulePrefill && (
        <PrefilledRuleModal
          open={ruleModalOpen}
          onOpenChange={setRuleModalOpen}
          tokenId={rulePrefill.tokenId}
          defaultRuleName={rulePrefill.ruleName}
          defaultConditionField={rulePrefill.conditionField}
          defaultConditionValue={rulePrefill.conditionValue}
        />
      )}
    </div>
  );
}
