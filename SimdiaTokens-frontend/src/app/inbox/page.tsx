"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Mail,
  Search,
  Shield,
  Brain,
  Loader2,
  AlertTriangle,
  InboxIcon,
  ChevronRight,
  Sparkles,
  X,
  FileText,
  Clock,
  User,
  AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { Token, GraphMessage, Rule, BECAnalysisReport } from "@/types/token";
import { fetchTokens, fetchInbox, fetchRules, analyzeInbox } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useDecryptedData } from "@/hooks/use-decrypted-data";
import { usePollingApi } from "@/lib/polling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { InboxList } from "@/components/inbox/email-list";
import { InboxDetail } from "@/components/inbox/email-detail";
import { InboxRuleModal } from "@/components/inbox/rule-creator-modal";
import { InboxForwardModal } from "@/components/inbox/email-forward-modal";
import { DashboardTopBar } from "@/components/dashboard/top-bar";

type Tab = "emails" | "rules";

function TokenAvatar({ email, size = 32 }: { email: string; size?: number }) {
  const initial = (email?.[0] || "?").toUpperCase();
  const hue = email.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-[10px]"
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue} 60% 20%)`,
        color: `hsl(${hue} 70% 70%)`,
        border: `1px solid hsl(${hue} 50% 30%)`,
      }}
    >
      {initial}
    </div>
  );
}



export default function InboxConsolePage() {
  const router = useRouter();

  // Tokens
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>("emails");

  // Emails
  const [messages, setMessages] = useState<GraphMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<GraphMessage | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRead, setFilterRead] = useState<"all" | "read" | "unread">("all");
  const [sortBy, setSortBy] = useState<"date" | "sender">("date");
  const [refreshing, setRefreshing] = useState(false);

  // Rules
  const [rules, setRules] = useState<Rule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  // AI Analysis
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<BECAnalysisReport | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Summarize
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // Modals
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);

  const mounted = useRef(false);

  // Decrypt sensitive fields
  const { data: decryptedTokens } = useDecryptedData(tokens);
  const { data: decryptedMessages } = useDecryptedData(messages);
  const { data: decryptedRules } = useDecryptedData(rules);

  const selectedToken = (decryptedTokens ?? tokens).find((t) => t.id === selectedTokenId) || null;

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    setTokensError(null);
    try {
      const data = await fetchTokens();
      setTokens(data || []);
    } catch (err: any) {
      setTokensError(err.message || "Failed to load tokens");
    } finally {
      setTokensLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!selectedTokenId) return;
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const data = await fetchInbox(selectedTokenId);
      let msgs: GraphMessage[] = data.value || [];

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        msgs = msgs.filter(
          (m) =>
            m.subject?.toLowerCase().includes(q) ||
            m.from?.emailAddress?.address?.toLowerCase().includes(q) ||
            m.bodyPreview?.toLowerCase().includes(q)
        );
      }

      if (filterRead !== "all") {
        msgs = msgs.filter((m) => (filterRead === "read" ? m.isRead : !m.isRead));
      }

      msgs.sort((a, b) => {
        if (sortBy === "date") {
          return new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime();
        }
        return (a.from?.emailAddress?.address || "").localeCompare(b.from?.emailAddress?.address || "");
      });

      setMessages(msgs);
    } catch (err: any) {
      setMessagesError(err.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setMessagesLoading(false);
      setRefreshing(false);
    }
  }, [selectedTokenId, searchQuery, filterRead, sortBy]);

  const loadRules = useCallback(async () => {
    if (!selectedTokenId) return;
    setRulesLoading(true);
    setRulesError(null);
    try {
      const data = await fetchRules(selectedTokenId);
      setRules(data || []);
    } catch (err: any) {
      setRulesError(err.message || "Failed to load rules");
    } finally {
      setRulesLoading(false);
    }
  }, [selectedTokenId]);

  // === Polling ===
  const { data: polledTokens } = usePollingApi<Token[]>({
    queryKey: ["tokens"],
    queryFn: fetchTokens,
    intervalMs: 60_000,
  });

  const { data: polledMessages } = usePollingApi<GraphMessage[]>({
    queryKey: ["inbox", selectedTokenId],
    queryFn: async () => {
      const res = await fetchInbox(selectedTokenId!);
      return res.value || [];
    },
    intervalMs: 30_000,
    enabled: !!selectedTokenId && activeTab === "emails",
  });

  const { data: polledRules } = usePollingApi<Rule[]>({
    queryKey: ["rules", selectedTokenId],
    queryFn: async () => fetchRules(selectedTokenId!),
    intervalMs: 60_000,
    enabled: !!selectedTokenId,
  });

  // Sync polled tokens
  useEffect(() => {
    if (polledTokens) setTokens(polledTokens);
  }, [polledTokens]);

  // Sync polled messages (apply filters)
  useEffect(() => {
    if (!polledMessages) return;
    let msgs = [...polledMessages];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      msgs = msgs.filter(
        (m) =>
          m.subject?.toLowerCase().includes(q) ||
          m.from?.emailAddress?.address?.toLowerCase().includes(q) ||
          m.bodyPreview?.toLowerCase().includes(q)
      );
    }
    if (filterRead !== "all") {
      msgs = msgs.filter((m) => (filterRead === "read" ? m.isRead : !m.isRead));
    }
    msgs.sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime();
      }
      return (a.from?.emailAddress?.address || "").localeCompare(b.from?.emailAddress?.address || "");
    });
    setMessages(msgs);
  }, [polledMessages, searchQuery, filterRead, sortBy]);

  // Sync polled rules
  useEffect(() => {
    if (polledRules) setRules(polledRules);
  }, [polledRules]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      loadTokens();
    }
  }, [loadTokens]);

  useEffect(() => {
    if (selectedTokenId) {
      loadMessages();
      loadRules();
      setSelectedMessage(null);
      setSummary(null);
    }
  }, [selectedTokenId, loadMessages, loadRules]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
  };

  const handleSelectMessage = (msg: GraphMessage) => {
    setSelectedMessage(msg);
    setSummary(null);
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)));
  };

  const handleMarkUnread = () => {
    if (!selectedMessage) return;
    setMessages((prev) => prev.map((m) => (m.id === selectedMessage.id ? { ...m, isRead: false } : m)));
    setSelectedMessage((prev) => (prev ? { ...prev, isRead: false } : null));
  };

  const handleSummarize = async () => {
    if (!selectedMessage || !selectedTokenId) return;
    setSummarizing(true);
    try {
      const res = await fetch(`/api/summarize?token_id=${encodeURIComponent(selectedTokenId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: selectedMessage.id,
          subject: selectedMessage.subject,
          body: selectedMessage.body?.content || selectedMessage.bodyPreview || "",
        }),
      });
      const data = await res.json();
      setSummary(data.summary || "No summary available.");
    } catch {
      setSummary(
        `Mock AI Summary: This email regarding "${selectedMessage.subject}" contains information related to account activity. The sender (${selectedMessage.from?.emailAddress?.address || "unknown"}) appears to be communicating about standard operational matters. Key action items may include review and follow-up.`
      );
    } finally {
      setSummarizing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedTokenId) return;
    setAiOpen(true);
    setAiLoading(true);
    setAiError(null);
    try {
      const report = await analyzeInbox(selectedTokenId);
      setAiReport(report);
    } catch (err: any) {
      setAiError(err.message || "Failed to analyze inbox");
    } finally {
      setAiLoading(false);
    }
  };

  const displayTokens = decryptedTokens ?? tokens;
  const filteredTokens = displayTokens.filter((t) => {
    if (!tokenSearch.trim()) return true;
    const q = tokenSearch.toLowerCase();
    return t.email.toLowerCase().includes(q) || t.source?.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DashboardTopBar
        title="Inbox Console"
        subtitle="Select a token to browse emails, manage rules, and run AI analysis"
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Token Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="w-[280px] flex-shrink-0 border-r border-white/5 bg-secondary/10 flex flex-col"
        >
          <div className="px-3 py-3 border-b border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Tokens</h3>
                <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                {displayTokens.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tokens..."
                value={tokenSearch}
                onChange={(e) => setTokenSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-secondary/50 border-white/5"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {tokensLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">Loading tokens...</p>
              </div>
            ) : tokensError ? (
              <div className="px-3 py-4">
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                  <p className="text-[11px] text-destructive">{tokensError}</p>
                </div>
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <InboxIcon className="h-8 w-8 text-muted-foreground/20 mb-2" />
                <p className="text-[11px] text-muted-foreground">No tokens found</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {filteredTokens.map((token) => {
                  const isSelected = token.id === selectedTokenId;
                  return (
                    <button
                      key={token.id}
                      onClick={() => setSelectedTokenId(token.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 transition-all duration-150 flex items-center gap-2.5",
                        isSelected
                          ? "bg-primary/10 border-l-2 border-primary"
                          : "border-l-2 border-transparent hover:bg-secondary/30"
                      )}
                    >
                      <TokenAvatar email={token.email} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{token.email}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {token.source || "Unknown"} • {token.last_activity ? formatDistanceToNow(new Date(token.last_activity), { addSuffix: true }) : "No activity"}
                        </p>
                      </div>
                      <ChevronRight className={cn("h-3.5 w-3.5 flex-shrink-0", isSelected ? "text-primary" : "text-muted-foreground/30")} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {!selectedToken ? (
            <div className="flex-1 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
              >
                <div className="h-16 w-16 rounded-2xl bg-secondary/30 border border-white/5 flex items-center justify-center mx-auto">
                  <Mail className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Select a Token</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose a token from the sidebar to view emails, rules, and run analysis
                  </p>
                </div>
              </motion.div>
            </div>
          ) : (
            <>
              {/* Token Header & Tabs */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-secondary/10">
                <div className="flex items-center gap-3">
                  <TokenAvatar email={selectedToken.email} size={28} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedToken.email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedToken.source || "Unknown source"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Tabs */}
                  <div className="flex items-center rounded-lg bg-secondary/50 border border-white/5 p-0.5">
                    <button
                      onClick={() => setActiveTab("emails")}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[11px] font-medium transition-all",
                        activeTab === "emails"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Emails
                    </button>
                    <button
                      onClick={() => setActiveTab("rules")}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[11px] font-medium transition-all",
                        activeTab === "rules"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Rules
                    </button>
                  </div>

                  <div className="h-5 w-px bg-white/10" />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAnalyze}
                    className="gap-1 text-[11px] h-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Brain className="h-3.5 w-3.5" />
                    AI Analysis
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <svg className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
                    </svg>
                  </Button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-0">
                <AnimatePresence mode="wait">
                  {activeTab === "emails" ? (
                    <motion.div
                      key="emails"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex-1 flex min-h-0 h-full"
                    >
                      {/* Email List */}
                      <div className="w-[340px] flex-shrink-0 border-r border-white/5 flex flex-col">
                        <InboxList
                          messages={decryptedMessages ?? messages}
                          selectedMessageId={selectedMessage?.id || null}
                          onSelectMessage={handleSelectMessage}
                          loading={messagesLoading}
                          error={messagesError}
                          searchQuery={searchQuery}
                          onSearchChange={setSearchQuery}
                          filterRead={filterRead}
                          onFilterChange={setFilterRead}
                          sortBy={sortBy}
                          onSortChange={setSortBy}
                          onRefresh={handleRefresh}
                          refreshing={refreshing}
                          onCreateRule={() => setRuleModalOpen(true)}
                        />
                      </div>

                      {/* Email Detail */}
                      <div className="flex-1 flex flex-col min-w-0">
                        <InboxDetail
                          message={(decryptedMessages ?? messages).find((m) => m.id === selectedMessage?.id) || selectedMessage}
                          tokenId={selectedTokenId!}
                          onSummarize={handleSummarize}
                          onForward={() => setForwardModalOpen(true)}
                          onCreateRule={() => setRuleModalOpen(true)}
                          onMarkUnread={handleMarkUnread}
                          onAnalyze={handleAnalyze}
                          onDelete={() => {}}
                          summarizing={summarizing}
                          summary={summary}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="rules"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex-1 min-h-0 p-4 overflow-y-auto"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Inbox Rules</h3>
                          <p className="text-[11px] text-muted-foreground">
                            Mail flow rules created for this token
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setRuleModalOpen(true)}
                        >
                          <Shield className="h-3.5 w-3.5" />
                          Create Rule
                        </Button>
                      </div>

                      {rulesLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <p className="text-[11px] text-muted-foreground">Loading rules...</p>
                        </div>
                      ) : rulesError ? (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                          <p className="text-[11px] text-destructive">{rulesError}</p>
                        </div>
                      )                       : (decryptedRules ?? rules).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <Shield className="h-8 w-8 text-muted-foreground/20 mb-2" />
                          <p className="text-sm text-muted-foreground">No rules found</p>
                          <p className="text-[11px] text-muted-foreground/60 mt-1">
                            Create a rule to automate mail flow handling
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/5 overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-white/5 hover:bg-transparent">
                                <TableHead className="text-[11px] uppercase tracking-wider">Name</TableHead>
                                <TableHead className="text-[11px] uppercase tracking-wider">Disguise</TableHead>
                                <TableHead className="text-[11px] uppercase tracking-wider">Status</TableHead>
                                <TableHead className="text-[11px] uppercase tracking-wider">Target</TableHead>
                                <TableHead className="text-[11px] uppercase tracking-wider">Created</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(decryptedRules ?? rules).map((rule) => (
                                <TableRow key={rule.id} className="border-white/5">
                                  <TableCell>
                                    <span className="text-xs font-medium text-foreground">{rule.display_name}</span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs text-muted-foreground">{rule.disguise_name}</span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "text-[10px]",
                                        rule.status === "active"
                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                          : "bg-muted/30 text-muted-foreground border-border"
                                      )}
                                    >
                                      {rule.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs text-muted-foreground">
                                      {rule.forward_to || rule.target_folder || "—"}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-[11px] text-muted-foreground">
                                      {format(new Date(rule.created_at), "MMM d, yyyy HH:mm")}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </main>
      </div>

      {/* AI Analysis Modal */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto glass-strong border-white/10">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/20 flex items-center justify-center">
                <Brain className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">AI Inbox Analysis</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  BEC intelligence report generated from inbox contents
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {aiLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-rose-400" />
              <p className="text-xs text-muted-foreground">Analyzing inbox with AI...</p>
            </div>
          ) : aiError ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-3">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">{aiError}</p>
            </div>
          ) : aiReport ? (
            <div className="space-y-5 py-2">
              {/* Risk Score */}
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "h-14 w-14 rounded-xl flex items-center justify-center text-lg font-bold border",
                    aiReport.riskScore >= 75
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : aiReport.riskScore >= 50
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  )}
                >
                  {aiReport.riskScore}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Risk Score</p>
                  <p className="text-[11px] text-muted-foreground">
                    {aiReport.emailCount} emails analyzed • {aiReport.severity.toUpperCase()} severity
                  </p>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl bg-secondary/30 border border-white/5 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                  Summary
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{aiReport.summary}</p>
              </div>

              {/* Opportunities */}
              {aiReport.opportunities.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Opportunities
                  </p>
                  <div className="space-y-2">
                    {aiReport.opportunities.map((opp, i) => (
                      <div key={i} className="rounded-lg bg-secondary/30 border border-white/5 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {opp.confidence}% confidence
                          </Badge>
                          <span className="text-xs font-medium text-foreground">{opp.type}</span>
                        </div>
                        <p className="text-xs text-foreground/70 mb-1">{opp.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Parties: {opp.involvedParties.join(", ")}
                        </p>
                        <p className="text-[10px] text-emerald-400 mt-1">
                          Suggested: {opp.suggestedAction}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial Threads */}
              {aiReport.financialThreads.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Financial Threads
                  </p>
                  <div className="space-y-2">
                    {aiReport.financialThreads.map((ft, i) => (
                      <div key={i} className="rounded-lg bg-secondary/30 border border-white/5 p-3">
                        <p className="text-xs font-medium text-foreground">{ft.subject}</p>
                        <p className="text-[11px] text-amber-400 mt-0.5">
                          {ft.amount} {ft.currency}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Parties: {ft.parties.join(", ")} • {format(new Date(ft.date), "MMM d, yyyy")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Executives */}
              {aiReport.executives.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Identified Executives
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {aiReport.executives.map((exec, i) => (
                      <div key={i} className="rounded-lg bg-secondary/30 border border-white/5 p-3">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-foreground">{exec.name}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground ml-5.5">{exec.title}</p>
                        <p className="text-[10px] text-muted-foreground/60 ml-5.5">{exec.email}</p>
                        <Badge variant="secondary" className="text-[10px] mt-1.5 ml-5.5">
                          Influence: {exec.influence}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attack Angles */}
              {aiReport.attackAngles.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Attack Angles
                  </p>
                  <div className="space-y-2">
                    {aiReport.attackAngles.map((angle, i) => (
                      <div key={i} className="rounded-lg bg-secondary/30 border border-white/5 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-foreground">{angle.scenario}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {angle.complexity} complexity
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {angle.successProbability}% success
                          </Badge>
                        </div>
                        <p className="text-xs text-foreground/70">{angle.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Prerequisites: {angle.prerequisites.join(", ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Rule Modal */}
      <InboxRuleModal
        open={ruleModalOpen}
        onOpenChange={setRuleModalOpen}
        tokenId={selectedTokenId || ""}
        message={selectedMessage}
      />

      {/* Forward Modal */}
      <InboxForwardModal
        open={forwardModalOpen}
        onOpenChange={setForwardModalOpen}
        tokenId={selectedTokenId || ""}
        message={selectedMessage}
      />
    </div>
  );
}
