"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Token, BECScanReport } from "@/types/token";
import { fetchTokens, fetchBECScan } from "@/lib/api";
import { ArrowLeft, ShieldAlert, Search, Loader2, MessageSquare, Users, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function BECScanPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params?.tokenId;
  const router = useRouter();

  const [token, setToken] = useState<Token | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [report, setReport] = useState<BECScanReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [expandedConv, setExpandedConv] = useState<string | null>(null);
  const mounted = useRef(false);

  const loadToken = useCallback(async () => {
    if (!tokenId) return;
    setTokenLoading(true);
    try {
      const data = await fetchTokens();
      const found = data?.find((t: Token) => t.id === tokenId) || null;
      setToken(found);
    } catch (err: any) {
      setTokenError(err.message || "Failed to load token");
    } finally {
      setTokenLoading(false);
    }
  }, [tokenId]);

  const runScan = useCallback(async () => {
    if (!tokenId) return;
    setReportLoading(true);
    setReport(null);
    try {
      const result = await fetchBECScan(tokenId);
      setReport(result);
    } catch (err: any) {
      toast.error(err.message || "BEC scan failed");
    } finally {
      setReportLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      loadToken();
    }
  }, [loadToken]);

  useEffect(() => {
    if (tokenId && token) runScan();
  }, [tokenId, token, runScan]);

  if (tokenLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 sm:px-6 glass-strong border-b border-white/5">
          <div className="h-4 w-20 animate-pulse rounded bg-white/5" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-32 animate-pulse rounded-xl bg-white/5" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tokenError || !token) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 sm:px-6 glass-strong border-b border-white/5">
          <button onClick={() => router.push("/")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Search className="h-8 w-8 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold text-muted-foreground">{tokenError || "Token not found"}</h3>
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 sm:px-6 glass-strong border-b border-white/5">
        <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground truncate">
            BEC Scan: {token.email}
          </h2>
          <p className="text-[10px] text-muted-foreground truncate">
            Conversation-based financial keyword detection
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={runScan}
          disabled={reportLoading}
          className="gap-1.5 border-white/10 bg-secondary/50 hover:bg-secondary"
        >
          {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          Re-scan
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6">
          {reportLoading && !report && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Scanning inbox for BEC conversations...</p>
            </div>
          )}

          {report && (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Conversations</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{report.total_conversations}</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4">
                    <p className="text-[11px] text-amber-400 uppercase tracking-wider">Flagged</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">{report.flagged_conversations}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Keywords</p>
                    <p className="text-2xl font-bold text-foreground mt-1">30+</p>
                  </div>
                </div>

                {/* Conversations */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Flagged Conversations ({report.conversations.length})
                  </h3>

                  {report.conversations.length === 0 ? (
                    <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-6 text-center">
                      <ShieldAlert className="h-8 w-8 mx-auto text-emerald-400 mb-2" />
                      <p className="text-sm text-emerald-400 font-medium">No BEC conversations found</p>
                      <p className="text-xs text-muted-foreground mt-1">No back-and-forth threads matched the financial keywords.</p>
                    </div>
                  ) : (
                    report.conversations.map((conv, i) => {
                      const isOpen = expandedConv === conv.conversation_id;
                      return (
                        <motion.div
                          key={conv.conversation_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="rounded-xl border border-white/5 bg-secondary/5 overflow-hidden"
                        >
                          {/* Conversation Header */}
                          <button
                            onClick={() => setExpandedConv(isOpen ? null : conv.conversation_id)}
                            className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-secondary/10 transition-colors"
                          >
                            <div className="mt-0.5">
                              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{conv.subject || "(No subject)"}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" /> {conv.message_count} msgs
                                </span>
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Users className="h-3 w-3" /> {conv.participant_count} participants
                                </span>
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {new Date(conv.latest_date).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                              {conv.keywords_matched.slice(0, 4).map((kw) => (
                                <Badge key={kw} variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                                  {kw}
                                </Badge>
                              ))}
                              {conv.keywords_matched.length > 4 && (
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">+{conv.keywords_matched.length - 4}</Badge>
                              )}
                            </div>
                          </button>

                          {/* Expanded Messages */}
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-3 space-y-2 border-t border-white/5 pt-3">
                                  {conv.messages.map((msg) => (
                                    <div key={msg.id} className={cn(
                                      "rounded-lg p-3 text-xs border",
                                      msg.is_read ? "border-white/5 bg-secondary/5" : "border-primary/10 bg-primary/5"
                                    )}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <span className="font-medium text-foreground">{msg.sender}</span>
                                          <span className="text-[10px] text-muted-foreground ml-2">{msg.sender_email}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{new Date(msg.received_date).toLocaleString()}</span>
                                      </div>
                                      <p className="text-muted-foreground mt-1.5">{msg.body_preview}</p>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
