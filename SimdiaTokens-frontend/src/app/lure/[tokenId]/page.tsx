"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Token } from "@/types/token";
import { fetchTokens, fetchContacts, sendMail, generateLureEmail } from "@/lib/api";
import {
  Fish, ArrowLeft, Loader2, AlertCircle, Send, User, Mail,
  Plus, X, Eye, ShieldAlert, CheckCircle2, Link as LinkIcon,
  Search, ChevronDown, Sparkles, FileText, Calendar, Receipt,
  Wand2,
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

type Contact = {
  id: string;
  displayName?: string;
  emailAddresses?: { address?: string; name?: string }[];
};

const LURE_TEMPLATES = [
  {
    id: "shared_document",
    label: "Shared Document",
    description: "OneDrive/SharePoint file share notification",
    icon: FileText,
  },
  {
    id: "meeting_followup",
    label: "Meeting Follow-up",
    description: "Teams meeting action items and notes",
    icon: Calendar,
  },
  {
    id: "invoice",
    label: "Invoice / Payment",
    description: "Vendor invoice or payment reminder",
    icon: Receipt,
  },
];

export default function LureComposerPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params?.tokenId;
  const router = useRouter();

  const [token, setToken] = useState<Token | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");

  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contentType, setContentType] = useState<"HTML" | "Text">("HTML");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [antiSpamNotes, setAntiSpamNotes] = useState<string[]>([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const mounted = useRef(false);

  const loadToken = useCallback(async () => {
    if (!tokenId) return;
    setTokenLoading(true);
    try {
      const data = await fetchTokens();
      setToken(data?.find((t: Token) => t.id === tokenId) || null);
    } catch (err: any) {
      setTokenError(err.message || "Failed to load token");
    } finally {
      setTokenLoading(false);
    }
  }, [tokenId]);

  const loadContacts = useCallback(async () => {
    if (!tokenId) return;
    setContactsLoading(true);
    setContactsError(null);
    try {
      const data = await fetchContacts(tokenId);
      setContacts(data.value || []);
    } catch (err: any) {
      setContactsError(err.message || "Failed to load contacts");
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      loadToken();
      loadContacts();
    }
  }, [loadToken, loadContacts]);

  const filteredContacts = contacts.filter((c) => {
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return (
      c.displayName?.toLowerCase().includes(q) ||
      c.emailAddresses?.some((e) => e.address?.toLowerCase().includes(q))
    );
  });

  const addRecipient = (email: string) => {
    if (!toRecipients.includes(email)) {
      setToRecipients([...toRecipients, email]);
    }
  };

  const removeRecipient = (email: string) => {
    setToRecipients(toRecipients.filter((e) => e !== email));
  };

  const insertOAuthLink = () => {
    const link = "[OAUTH_LINK_PLACEHOLDER]";
    setBody((prev) => prev + `\n\n<a href="${link}">View document</a>`);
  };

  const handleGenerateAI = async (templateType: string) => {
    if (!token || toRecipients.length === 0) {
      toast.error("Add at least one recipient first");
      return;
    }
    setGenerating(true);
    setTemplatePickerOpen(false);
    try {
      const targetEmail = toRecipients[0];
      const targetContact = contacts.find((c) => c.emailAddresses?.some((e) => e.address === targetEmail));
      const res = await generateLureEmail({
        target_email: targetEmail,
        target_name: targetContact?.displayName || undefined,
        victim_email: token.email || "",
        template_type: templateType,
        context: "corporate office environment",
      });
      setSubject(res.subject);
      setBody(res.html_body || res.body);
      setContentType("HTML");
      setAntiSpamNotes(res.anti_spam_notes || []);
      toast.success("AI lure email generated", { description: "Anti-spam techniques applied" });
    } catch (err: any) {
      toast.error(err.message || "Failed to generate lure email");
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = () => {
    if (toRecipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!body.trim()) {
      toast.error("Body is required");
      return;
    }
    setPreviewOpen(true);
  };

  const handleRequestApproval = () => {
    setPreviewOpen(false);
    setApprovalOpen(true);
    setConfirmText("");
  };

  const handleSend = async () => {
    if (confirmText.trim().toUpperCase() !== "SEND") {
      toast.error('Type "SEND" to confirm');
      return;
    }
    if (!tokenId) return;
    setSending(true);
    try {
      await sendMail(tokenId, {
        to: toRecipients,
        subject,
        body,
        content_type: contentType,
      });
      toast.success(`Lure email sent to ${toRecipients.join(", ")}`);
      setApprovalOpen(false);
      setToRecipients([]);
      setSubject("");
      setBody("");
      setAntiSpamNotes([]);
    } catch (err: any) {
      toast.error(err.message || "Failed to send lure email");
    } finally {
      setSending(false);
    }
  };

  if (tokenLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 sm:px-6 glass-strong border-b border-white/5">
          <div className="h-4 w-20 animate-pulse rounded bg-white/5" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (tokenError || !token) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 sm:px-6 glass-strong border-b border-white/5">
          <Button variant="ghost" size="sm" onClick={() => router.push("/lure")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="h-8 w-8 text-rose-400" />
          <p className="text-sm text-muted-foreground">{tokenError || "Token not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 sm:px-6 glass-strong border-b border-white/5">
        <Button variant="ghost" size="sm" onClick={() => router.push("/lure")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <TokenAvatar email={token.email || "?"} size={28} />
          <div>
            <p className="text-sm font-medium text-foreground">{token.email}</p>
            <p className="text-[10px] text-muted-foreground">Lure Composer</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(true)} disabled={generating}>
            <Wand2 className="h-4 w-4 mr-1.5" />
            {generating ? "Generating..." : "AI Generate"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className="h-4 w-4 mr-1.5" /> Preview
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Contacts */}
            <div className="lg:col-span-1">
              <div className="rounded-xl border border-white/5 bg-secondary/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Contacts</h3>
                  </div>
                  {contactsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="p-3">
                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Search contacts..."
                      className="pl-8 h-8 text-xs bg-secondary/30 border-white/5"
                    />
                  </div>
                  <ScrollArea className="h-[400px]">
                    {contactsError ? (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-400" />
                        <p className="text-xs text-muted-foreground">{contactsError}</p>
                      </div>
                    ) : filteredContacts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <User className="h-6 w-6 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">No contacts found</p>
                        <p className="text-[10px] text-muted-foreground/60 text-center px-4">
                          Contacts require <code className="bg-secondary/50 px-1 rounded">Contacts.Read</code> scope. New tokens will have this scope.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredContacts.map((contact) => {
                          const email = contact.emailAddresses?.[0]?.address;
                          return (
                            <button
                              key={contact.id}
                              onClick={() => email && addRecipient(email)}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors text-left hover:bg-secondary/50"
                            >
                              <TokenAvatar email={email || contact.displayName || "?"} size={24} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground truncate">{contact.displayName || email || "Unknown"}</p>
                                {email && <p className="text-[10px] text-muted-foreground truncate">{email}</p>}
                              </div>
                              <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>

            {/* Right: Composer */}
            <div className="lg:col-span-2 space-y-4">
              {/* Recipients */}
              <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">To</label>
                <div className="flex flex-wrap gap-2 min-h-[36px] p-2 rounded-lg border border-white/5 bg-secondary/30">
                  {toRecipients.map((email) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="gap-1.5 text-xs bg-primary/10 text-primary border-primary/20"
                    >
                      {email}
                      <button onClick={() => removeRecipient(email)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Input
                    placeholder="Add email..."
                    className="flex-1 min-w-[150px] h-7 text-xs bg-transparent border-0 px-0 focus-visible:ring-0"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && val.includes("@")) {
                          addRecipient(val);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Subject */}
              <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter subject..."
                  className="h-10 bg-secondary/30 border-white/5"
                />
              </div>

              {/* Body */}
              <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">Body</label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setContentType("HTML")}
                        className={cn("text-[11px] px-2 py-0.5 rounded transition-colors", contentType === "HTML" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}
                      >HTML</button>
                      <button
                        onClick={() => setContentType("Text")}
                        className={cn("text-[11px] px-2 py-0.5 rounded transition-colors", contentType === "Text" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}
                      >Text</button>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={insertOAuthLink}>
                      <LinkIcon className="h-3 w-3" /> Insert Link
                    </Button>
                  </div>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={contentType === "HTML" ? "Type your HTML message..." : "Type your message..."}
                  className="w-full h-64 rounded-lg border border-white/5 bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-primary/30 resize-none font-mono"
                />
              </div>

              {/* Anti-spam notes */}
              {antiSpamNotes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    <p className="text-[11px] font-semibold text-emerald-400 uppercase">Anti-Spam Techniques Applied</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {antiSpamNotes.map((note, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        {note}
                      </Badge>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Send Button */}
              <div className="flex justify-end">
                <Button
                  onClick={handlePreview}
                  className="gap-2 bg-primary hover:bg-primary/90"
                  size="lg"
                >
                  <Send className="h-4 w-4" />
                  Preview & Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template Picker Dialog */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="sm:max-w-[500px] glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Generate AI Lure Email
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select a template. AI will generate a sophisticated lure that bypasses spam filters using natural language variation and contextual personalization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {LURE_TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => handleGenerateAI(tmpl.id)}
                  className="w-full flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-secondary/10 hover:bg-secondary/20 hover:border-primary/20 transition-all text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{tmpl.label}</p>
                    <p className="text-[11px] text-muted-foreground">{tmpl.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[600px] glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Email Preview</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Review the lure email before requesting admin approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">From:</span>
              <Badge variant="secondary" className="text-xs bg-secondary/50">{token.email}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">To:</span>
              <div className="flex flex-wrap gap-1">
                {toRecipients.map((email) => (
                  <Badge key={email} variant="secondary" className="text-xs bg-secondary/50">{email}</Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">Subject:</span>
              <span className="text-foreground font-medium">{subject}</span>
            </div>
            <div className="rounded-lg border border-white/5 bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Body preview:</p>
              {contentType === "HTML" ? (
                <div
                  className="text-sm text-foreground prose prose-invert max-w-none prose-sm"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              ) : (
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">{body}</pre>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>Edit</Button>
            <Button size="sm" onClick={handleRequestApproval} className="gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              Request Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent className="sm:max-w-[450px] glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              Admin Approval Required
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              You are about to send a phishing lure email from <strong>{token.email}</strong>. This action is irreversible and may trigger security alerts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-200/80 space-y-1">
                  <p>This email will be sent from the victim's real Outlook account.</p>
                  <p>Recipients: <strong>{toRecipients.join(", ")}</strong></p>
                  <p>Subject: <strong>{subject}</strong></p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Type <strong>SEND</strong> to confirm:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type SEND to confirm"
                className="h-10 bg-secondary/30 border-white/5 font-mono"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setApprovalOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || confirmText.trim().toUpperCase() !== "SEND"}
              className="gap-1.5 bg-rose-500 hover:bg-rose-600 text-white"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Lure Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
