"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Token, GraphMessage, MailFolder } from "@/types/token";
import { fetchTokens, fetchInbox, fetchMailFolders, fetchFolderMessages, deleteMessage, createFolder, sendMail, fetchLocalFolders, createLocalFolder, runAutoFilter, fetchLocalFolderMessages } from "@/lib/api";
import {
  AlertCircle, ArrowLeft, Mail, Inbox, Send, Trash2, ShieldAlert, FileText,
  PenLine, FolderPlus, Loader2, Search, Paperclip, Star, CornerUpLeft,
  CornerUpRight, Archive, MoreHorizontal, ChevronDown, Clock, User, Calendar,
  Reply, ReplyAll, Flag, X, Check, Brain, Sparkles, Forward, Shield, MailMinus,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

// ---- OUTLOOK-STYLE FOLDER SIDEBAR ----
function FolderSidebar({
  folders,
  localFolders,
  activeFolder,
  activeFolderIsLocal,
  onSelectFolder,
  onSelectLocalFolder,
  onCreateLocalFolder,
  onCompose,
}: {
  folders: MailFolder[];
  localFolders: { id: string; name: string }[];
  activeFolder: string;
  activeFolderIsLocal: boolean;
  onSelectFolder: (id: string) => void;
  onSelectLocalFolder: (id: string) => void;
  onCreateLocalFolder: () => void;
  onCompose: () => void;
}) {
  const sortedFolders = useMemo(() => {
    const order = ["inbox", "drafts", "sentitems", "deleteditems", "archive", "junkemail", "outbox", "conversationhistory"];
    const sorted: MailFolder[] = [];
    for (const wk of order) {
      const f = folders.find((x) => x.wellKnownName === wk);
      if (f) sorted.push(f);
    }
    for (const f of folders) {
      if (!sorted.find((x) => x.id === f.id)) sorted.push(f);
    }
    return sorted;
  }, [folders]);

  const renderFolder = (folder: MailFolder) => {
    const isActive = !activeFolderIsLocal && activeFolder === folder.id;
    const wk = folder.wellKnownName;
    let Icon = FileText;
    let iconColor = "text-muted-foreground";
    if (wk === "inbox") { Icon = Inbox; iconColor = "text-primary"; }
    else if (wk === "sentitems") { Icon = Send; }
    else if (wk === "deleteditems") { Icon = Trash2; }
    else if (wk === "junkemail") { Icon = ShieldAlert; iconColor = "text-amber-400"; }
    else if (wk === "drafts") { Icon = FileText; }

    return (
      <button
        key={folder.id}
        onClick={() => onSelectFolder(folder.id)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-foreground hover:bg-secondary/50"
        )}
      >
        <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
        <span className="flex-1 text-left truncate">{folder.displayName}</span>
        {folder.unreadItemCount ? (
          <span className="text-[10px] font-semibold bg-primary/20 text-primary px-1.5 py-0 rounded-full">
            {folder.unreadItemCount}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="w-[220px] flex-shrink-0 border-r border-white/5 bg-secondary/5 flex flex-col">
      {/* New Mail Button */}
      <div className="p-3">
        <Button
          onClick={onCompose}
          className="w-full gap-2 justify-center bg-primary hover:bg-primary/90 text-primary-foreground"
          size="sm"
        >
          <PenLine className="h-4 w-4" />
          New mail
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 pb-4">
        {/* Real Folders */}
        {sortedFolders.length > 0 && (
          <div className="mb-3">
            <div className="space-y-0.5">{sortedFolders.map(renderFolder)}</div>
          </div>
        )}

        {/* Local / Starred Folders */}
        <div className="mb-3">
          <div className="flex items-center justify-between px-3 py-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Starred</p>
            <button onClick={onCreateLocalFolder} className="text-[10px] text-primary hover:text-primary/80">
              + New
            </button>
          </div>
          <div className="space-y-0.5">
            {localFolders.map((lf) => (
              <button
                key={lf.id}
                onClick={() => onSelectLocalFolder(lf.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors",
                  activeFolderIsLocal && activeFolder === lf.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-secondary/50"
                )}
              >
                <Star className="h-4 w-4 flex-shrink-0 text-amber-400" />
                <span className="flex-1 text-left truncate">{lf.name}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ---- OUTLOOK-STYLE MESSAGE LIST ----
function MessageList({
  messages,
  selectedMessageId,
  onSelectMessage,
  loading,
  searchQuery,
  onSearchChange,
}: {
  messages: GraphMessage[];
  selectedMessageId: string | null;
  onSelectMessage: (msg: GraphMessage) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="w-[380px] flex-shrink-0 border-r border-white/5 flex flex-col bg-background/50">
      {/* Search header */}
      <div className="p-3 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs bg-secondary/50 border-white/5"
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Mail className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">No messages found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            <AnimatePresence>
              {messages.map((msg, i) => {
                const isSelected = msg.id === selectedMessageId;
                const isRead = !!msg.isRead;
                const from = msg.from?.emailAddress;
                const initials = (from?.name || from?.address || "?")[0].toUpperCase();

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    onClick={() => onSelectMessage(msg)}
                    className={cn(
                      "group px-3 py-2.5 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/5 border-l-[3px] border-primary"
                        : "border-l-[3px] border-transparent hover:bg-secondary/30"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Avatar */}
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold",
                        !isRead ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      )}>
                        {initials}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-xs truncate", !isRead ? "font-semibold text-foreground" : "text-muted-foreground")}>
                            {from?.name || from?.address || "Unknown"}
                          </p>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                            {formatDistanceToNow(new Date(msg.receivedDateTime), { addSuffix: false })
                              .replace("about ", "").replace("less than a minute", "now")
                              .replace(/ minutes?/, "m").replace(/ hours?/, "h").replace(/ days?/, "d")}
                          </span>
                        </div>
                        <p className={cn("text-xs truncate mt-0.5", !isRead ? "font-medium text-foreground" : "text-muted-foreground/70")}>
                          {msg.subject || "(No subject)"}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                          {msg.bodyPreview}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {msg.hasAttachments && <Paperclip className="h-3 w-3 text-muted-foreground/40" />}
                          {!isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- OUTLOOK-STYLE READING PANE ----
function ReadingPane({
  message,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onMarkUnread,
  onSummarize,
  onAnalyze,
  summarizing,
  summary,
}: {
  message: GraphMessage | null;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onDelete: () => void;
  onMarkUnread: () => void;
  onSummarize: () => void;
  onAnalyze: () => void;
  summarizing: boolean;
  summary: string | null;
}) {
  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center bg-secondary/5">
        <div className="text-center space-y-3">
          <Mail className="h-12 w-12 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">Select an item to read</p>
        </div>
      </div>
    );
  }

  const from = message.from?.emailAddress;
  const contentType = message.body?.contentType || "text";
  const bodyContent = message.body?.content || message.bodyPreview || "";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-secondary/5">
      {/* Command Bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 bg-background/50">
        <Button variant="ghost" size="sm" onClick={onReply} className="gap-1.5 h-8 text-xs">
          <Reply className="h-3.5 w-3.5" /> Reply
        </Button>
        <Button variant="ghost" size="sm" onClick={onReplyAll} className="gap-1.5 h-8 text-xs">
          <ReplyAll className="h-3.5 w-3.5" /> Reply all
        </Button>
        <Button variant="ghost" size="sm" onClick={onForward} className="gap-1.5 h-8 text-xs">
          <Forward className="h-3.5 w-3.5" /> Forward
        </Button>
        <div className="h-4 w-px bg-white/10 mx-1" />
        <Button variant="ghost" size="sm" onClick={onDelete} className="gap-1.5 h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
        <Button variant="ghost" size="sm" onClick={onMarkUnread} className="gap-1.5 h-8 text-xs">
          <MailMinus className="h-3.5 w-3.5" /> Mark unread
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onSummarize} disabled={summarizing} className="gap-1.5 h-8 text-xs text-amber-400">
          <Sparkles className={cn("h-3.5 w-3.5", summarizing && "animate-spin")} /> Summarize
        </Button>
        <Button variant="ghost" size="sm" onClick={onAnalyze} className="gap-1.5 h-8 text-xs text-rose-400">
          <Brain className="h-3.5 w-3.5" /> Analyze
        </Button>
      </div>

      {/* AI Summary */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mx-4 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-[11px] font-semibold text-amber-400 uppercase">AI Summary</p>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">{summary}</p>
        </motion.div>
      )}

      {/* Email Header */}
      <div className="px-6 py-4 border-b border-white/5">
        <h2 className="text-base font-semibold text-foreground mb-3">{message.subject || "(No subject)"}</h2>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-primary">
              {(from?.name || from?.address || "?")[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{from?.name || from?.address || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">&lt;{from?.address || "unknown"}&gt;</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{format(new Date(message.receivedDateTime), "MMM d, yyyy")}</p>
                <p className="text-[10px] text-muted-foreground/60">{format(new Date(message.receivedDateTime), "h:mm a")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">To me</span>
              {message.hasAttachments && (
                <span className="text-[10px] text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> Attachments
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email Body */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-5">
          <div className="max-w-3xl mx-auto">
            {contentType === "html" ? (
              <div
                className="prose prose-invert prose-sm max-w-none
                  [&_a]:text-primary [&_a]:underline [&_img]:rounded-lg [&_img]:max-w-full
                  [&_table]:w-full [&_table]:border-collapse
                  [&_td]:border [&_td]:border-white/10 [&_td]:p-2 [&_td]:text-xs
                  [&_th]:border [&_th]:border-white/10 [&_th]:p-2 [&_th]:text-xs
                  [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
                  [&_pre]:bg-secondary/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs
                  [&_code]:bg-secondary/30 [&_code]:rounded [&_code]:px-1 [&_code]:text-xs
                  [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
                  [&_li]:text-xs [&_li]:text-foreground/80
                  [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm
                  [&_p]:text-xs [&_p]:text-foreground/80 [&_p]:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: bodyContent }}
              />
            ) : (
              <div
                className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{
                  __html: bodyContent.replace(/\n/g, "<br>").replace(
                    /(https?:\/\/[^\s<]+)/g,
                    '<a href="$1" class="text-primary underline" target="_blank" rel="noopener noreferrer">$1</a>'
                  ),
                }}
              />
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export default function InboxPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params?.tokenId;
  const router = useRouter();

  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  const [messages, setMessages] = useState<GraphMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<GraphMessage | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [localFolders, setLocalFolders] = useState<{ id: string; name: string }[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("inbox");
  const [activeFolderIsLocal, setActiveFolderIsLocal] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createLocalFolderOpen, setCreateLocalFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newLocalFolderName, setNewLocalFolderName] = useState("");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [filtering, setFiltering] = useState(false);

  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

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

  const loadFolders = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchMailFolders(tokenId);
      setFolders(data.value || []);
    } catch { /* silent */ }
  }, [tokenId]);

  const loadLocalFolders = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchLocalFolders(tokenId);
      setLocalFolders(data.value || []);
    } catch { /* silent */ }
  }, [tokenId]);

  const loadMessages = useCallback(async () => {
    if (!tokenId) return;
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      let msgs: GraphMessage[] = [];
      if (activeFolderIsLocal) {
        const data = await fetchLocalFolderMessages(tokenId, activeFolder);
        msgs = (data.value || []).map((m: any) => ({
          id: m.message_id || m.id,
          subject: m.subject || "(No subject)",
          from: { emailAddress: { name: m.sender || m.sender_email, address: m.sender_email } },
          receivedDateTime: m.received_date || new Date().toISOString(),
          bodyPreview: m.body_preview || "",
          isRead: true,
          hasAttachments: false,
          body: { contentType: "text", content: m.body_preview || "" },
        }));
      } else if (activeFolder === "inbox") {
        const data = await fetchInbox(tokenId);
        msgs = data.value || [];
      } else {
        const data = await fetchFolderMessages(tokenId, activeFolder);
        msgs = data.value || [];
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        msgs = msgs.filter(
          (m) =>
            m.subject?.toLowerCase().includes(q) ||
            m.from?.emailAddress?.address?.toLowerCase().includes(q) ||
            m.bodyPreview?.toLowerCase().includes(q)
        );
      }
      msgs.sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime());
      setMessages(msgs);
    } catch (err: any) {
      setMessagesError(err.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setMessagesLoading(false);
      setRefreshing(false);
    }
  }, [tokenId, searchQuery, activeFolder, activeFolderIsLocal]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      loadToken();
      loadFolders();
      loadLocalFolders();
    }
  }, [loadToken, loadFolders, loadLocalFolders]);

  useEffect(() => {
    if (tokenId) loadMessages();
  }, [loadMessages]);

  const handleRefresh = async () => { setRefreshing(true); await loadMessages(); };

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
    if (!selectedMessage || !tokenId) return;
    setSummarizing(true);
    try {
      const res = await fetch(`/api/summarize?token_id=${encodeURIComponent(tokenId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: selectedMessage.id, subject: selectedMessage.subject, body: selectedMessage.body?.content || selectedMessage.bodyPreview || "" }),
      });
      const data = await res.json();
      setSummary(data.summary || "No summary available.");
    } catch {
      setSummary(`Mock summary for "${selectedMessage.subject}"`);
    } finally {
      setSummarizing(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage || !tokenId) return;
    if (!confirm("Delete this email?")) return;
    try {
      await deleteMessage(tokenId, selectedMessage.id);
      toast.success("Email deleted");
      setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
      setSelectedMessage(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleCreateFolder = async () => {
    if (!tokenId || !newFolderName.trim()) return;
    try {
      await createFolder(tokenId, newFolderName.trim());
      toast.success(`Folder "${newFolderName}" created`);
      setNewFolderName("");
      setCreateFolderOpen(false);
      loadFolders();
    } catch (err: any) {
      toast.error(err.message || "Failed to create folder");
    }
  };

  const handleSendMail = async () => {
    if (!tokenId || !composeTo.trim() || !composeSubject.trim()) {
      toast.error("To and Subject are required");
      return;
    }
    setSending(true);
    try {
      await sendMail(tokenId, { subject: composeSubject, body: composeBody, to: composeTo.split(",").map((e) => e.trim()).filter(Boolean), content_type: "HTML" });
      toast.success("Email sent");
      setComposeTo(""); setComposeSubject(""); setComposeBody(""); setComposeAttachments([]);
      setComposeOpen(false);
      loadMessages();
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleCreateLocalFolder = async () => {
    if (!tokenId || !newLocalFolderName.trim()) return;
    try {
      await createLocalFolder(tokenId, newLocalFolderName.trim());
      toast.success(`Local folder "${newLocalFolderName}" created`);
      setNewLocalFolderName("");
      setCreateLocalFolderOpen(false);
      loadLocalFolders();
    } catch (err: any) {
      toast.error(err.message || "Failed to create local folder");
    }
  };

  const handleAutoFilter = async () => {
    if (!tokenId) return;
    setFiltering(true);
    try {
      const res = await runAutoFilter(tokenId);
      toast.success(`Auto-filter complete`, { description: `${res.moved} message(s) moved to FILTERED` });
      loadLocalFolders();
    } catch (err: any) {
      toast.error(err.message || "Auto-filter failed");
    } finally {
      setFiltering(false);
    }
  };

  useKeyboardShortcuts({ "ctrl+r": handleRefresh });

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
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Return to Dashboard</Link>
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
          <Button variant="ghost" size="sm" onClick={handleAutoFilter} disabled={filtering} className="gap-1.5 h-8 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
            {filtering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            Filter
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setComposeOpen(true)} className="gap-1.5 h-8 text-xs">
            <PenLine className="h-3.5 w-3.5" /> New mail
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8 w-8 p-0">
            <svg className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          </Button>
        </div>
      </div>

      {/* Three-pane Outlook layout */}
      <div className="flex-1 flex min-h-0">
        <FolderSidebar
          folders={folders}
          localFolders={localFolders}
          activeFolder={activeFolder}
          activeFolderIsLocal={activeFolderIsLocal}
          onSelectFolder={(id) => { setActiveFolder(id); setActiveFolderIsLocal(false); }}
          onSelectLocalFolder={(id) => { setActiveFolder(id); setActiveFolderIsLocal(true); }}
          onCreateLocalFolder={() => setCreateLocalFolderOpen(true)}
          onCompose={() => setComposeOpen(true)}
        />
        <MessageList
          messages={messages}
          selectedMessageId={selectedMessage?.id || null}
          onSelectMessage={handleSelectMessage}
          loading={messagesLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <ReadingPane
          message={selectedMessage}
          onReply={() => toast.info("Reply: compose with original sender pre-filled")}
          onReplyAll={() => toast.info("Reply All: compose with all recipients pre-filled")}
          onForward={() => toast.info("Forward: use the Forward modal")}
          onDelete={handleDeleteMessage}
          onMarkUnread={handleMarkUnread}
          onSummarize={handleSummarize}
          onAnalyze={() => router.push(`/analyze/${encodeURIComponent(tokenId!)}`)}
          summarizing={summarizing}
          summary={summary}
        />
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <span className="text-[11px] text-muted-foreground w-12">To</span>
              <Input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="recipient@example.com" className="flex-1 bg-transparent border-0 text-xs px-0 focus-visible:ring-0" autoComplete="off" />
            </div>
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <span className="text-[11px] text-muted-foreground w-12">Subject</span>
              <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Add a subject" className="flex-1 bg-transparent border-0 text-xs px-0 focus-visible:ring-0" autoComplete="off" />
            </div>
            <textarea
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              placeholder="Type your message..."
              rows={8}
              className="w-full bg-transparent text-xs text-foreground outline-none resize-none"
            />
            {/* Attachments */}
            <div className="space-y-2">
              <input
                type="file"
                multiple
                id="compose-attachments"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setComposeAttachments((prev) => [...prev, ...files]);
                }}
              />
              <label htmlFor="compose-attachments" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
                <Paperclip className="h-3.5 w-3.5" /> Attach files
              </label>
              {composeAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {composeAttachments.map((file, idx) => (
                    <Badge key={idx} variant="secondary" className="text-[10px] gap-1">
                      {file.name}
                      <button onClick={() => setComposeAttachments((prev) => prev.filter((_, i) => i !== idx))} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setComposeOpen(false)}>Discard</Button>
            <Button size="sm" onClick={handleSendMail} disabled={sending} className="gap-1.5">
              {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Send className="h-3.5 w-3.5" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Graph Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Create Outlook folder</DialogTitle></DialogHeader>
          <div className="py-2">
            <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" className="bg-secondary/50 border-white/5" autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateFolderOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Local Folder Dialog */}
      <Dialog open={createLocalFolderOpen} onOpenChange={setCreateLocalFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create local folder</DialogTitle>
            <DialogDescription className="text-[11px]">Local folders are only visible in this system, not in Outlook.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input value={newLocalFolderName} onChange={(e) => setNewLocalFolderName(e.target.value)} placeholder="Folder name" className="bg-secondary/50 border-white/5" autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateLocalFolderOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateLocalFolder} disabled={!newLocalFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
