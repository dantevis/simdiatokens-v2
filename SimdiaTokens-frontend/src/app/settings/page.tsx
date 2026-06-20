"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Lock,
  Unlock,
  Brain,
  Eye,
  EyeOff,
  Shield,
  Globe,
  Link,
  Zap,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  TestTube,
  Send,
  ChevronRight,
  Server,
  Activity,
  KeyRound,
  QrCode,
  Gavel,
  ListFilter,
  Plus,
  RefreshCw,
  ArrowRight,
  Folder,
  Forward,
  Check,
  X,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardTopBar } from "@/components/dashboard/top-bar";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAiSettings,
  saveAiSettings,
  fetchStealthConfig,
  testDecryption,
  purgeExpiredTokens,
  changePassword,
  changeUsername,
  fetchRules,
  deleteRule,
  fetchTokens,
} from "@/lib/utils";

// === Schemas ===

const aiSettingsSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
  model: z.enum(["gpt-4o-mini", "gpt-4o"]),
  max_tokens: z.number().min(100).max(8000),
});

type AiSettingsForm = z.infer<typeof aiSettingsSchema>;

const webhookSchema = z.object({
  webhook_url: z.string().url("Must be a valid URL").or(z.literal("")),
});

type WebhookForm = z.infer<typeof webhookSchema>;

// === Components ===

function SectionCard({
  title,
  icon: Icon,
  children,
  danger = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border overflow-hidden",
        danger ? "border-rose-500/20 bg-rose-500/5" : "border-white/5 bg-secondary/10"
      )}
    >
      <div className={cn("px-5 py-3 border-b flex items-center gap-2", danger ? "border-rose-500/10" : "border-white/5")}>
        <Icon className={cn("h-4 w-4", danger ? "text-rose-400" : "text-primary")} />
        <h3 className={cn("text-sm font-semibold", danger ? "text-rose-400" : "text-foreground")}>{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </motion.div>
  );
}

export default function SettingsPage() {
  const { hasRole, refreshUser, user } = useAuth();
  const isAdmin = hasRole("admin");

  // Encryption
  const [passphrase, setPassphrase] = useState("");
  const [encryptionActive, setEncryptionActive] = useState(false);
  const [testCiphertext, setTestCiphertext] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Password Change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordChanging, setPasswordChanging] = useState(false);

  // Username Change
  const [usernameCurrentPassword, setUsernameCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [showUsernamePassword, setShowUsernamePassword] = useState(false);
  const [usernameChanging, setUsernameChanging] = useState(false);

  // 2FA / Barcode Authentication
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Enter both current and new password");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setPasswordChanging(true);
    try {
      const res = await changePassword({ current_password: currentPassword, new_password: newPassword });
      if (res.success) {
        toast.success("Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(res.message || "Failed to change password");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleChangeUsername = async () => {
    if (!newUsername.trim()) {
      toast.error("Enter a new username");
      return;
    }
    if (newUsername.trim().length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(newUsername.trim())) {
      toast.error("Username may only contain letters, numbers, _, -, or .");
      return;
    }
    if (!usernameCurrentPassword) {
      toast.error("Enter your current password to confirm");
      return;
    }
    setUsernameChanging(true);
    try {
      const res = await changeUsername({ current_password: usernameCurrentPassword, new_username: newUsername.trim() });
      if (res.success) {
        toast.success("Username changed successfully", { description: "Please log in again with your new username." });
        setUsernameCurrentPassword("");
        setNewUsername("");
        // Refresh the cached user so the UI updates immediately.
        await refreshUser();
      } else {
        toast.error(res.message || "Failed to change username");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to change username");
    } finally {
      setUsernameChanging(false);
    }
  };

  // Load passphrase from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("simdia_passphrase");
    if (saved) {
      setPassphrase(saved);
      setEncryptionActive(true);
    }
  }, []);

  const handleSavePassphrase = () => {
    if (passphrase.trim()) {
      sessionStorage.setItem("simdia_passphrase", passphrase.trim());
      setEncryptionActive(true);
      toast.success("Passphrase saved to session storage");
    }
  };

  const handleClearPassphrase = () => {
    sessionStorage.removeItem("simdia_passphrase");
    setPassphrase("");
    setEncryptionActive(false);
    toast.success("Passphrase cleared");
  };

  const handleTestDecrypt = async () => {
    if (!passphrase || !testCiphertext) {
      toast.error("Enter both passphrase and ciphertext");
      return;
    }
    try {
      const res = await testDecryption(passphrase, testCiphertext);
      if (res.success) {
        setTestResult({ success: true, message: `Decrypted: ${res.plaintext}` });
      } else {
        setTestResult({ success: false, message: res.error || "Decryption failed" });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Request failed" });
    }
  };

  // AI Settings
  const {
    data: aiSettings,
    isLoading: aiLoading,
  } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: fetchAiSettings,
  });

  const {
    register: registerAi,
    handleSubmit: handleSubmitAi,
    watch: watchAi,
    setValue: setValueAi,
    formState: { errors: aiErrors, isSubmitting: aiSubmitting },
  } = useForm<AiSettingsForm>({
    resolver: zodResolver(aiSettingsSchema),
    defaultValues: {
      api_key: "",
      model: "gpt-4o-mini",
      max_tokens: 4000,
    },
  });

  useEffect(() => {
    if (aiSettings) {
      setValueAi("api_key", aiSettings.api_key || "");
      setValueAi("model", (aiSettings.model as "gpt-4o-mini" | "gpt-4o") || "gpt-4o-mini");
      setValueAi("max_tokens", aiSettings.max_tokens || 4000);
    }
  }, [aiSettings, setValueAi]);

  const saveAiMutation = useMutation({
    mutationFn: saveAiSettings,
    onSuccess: () => {
      toast.success("AI settings saved");
    },
    onError: (err: any) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  const onSubmitAi = (data: AiSettingsForm) => {
    saveAiMutation.mutate(data);
  };

  // Stealth Config
  const { data: stealthConfig, isLoading: stealthLoading } = useQuery({
    queryKey: ["stealth-config"],
    queryFn: fetchStealthConfig,
  });

  // Webhook
  const {
    register: registerWebhook,
    handleSubmit: handleSubmitWebhook,
    formState: { errors: webhookErrors },
  } = useForm<WebhookForm>({
    resolver: zodResolver(webhookSchema),
    defaultValues: { webhook_url: "" },
  });

  const [webhookTesting, setWebhookTesting] = useState(false);

  const handleTestWebhook = async (data: WebhookForm) => {
    if (!data.webhook_url) {
      toast.error("Enter a webhook URL");
      return;
    }
    setWebhookTesting(true);
    try {
      const res = await fetch(data.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "🔔 **SimdiaTokens Test Webhook**\nThis is a test alert from your SimdiaTokens dashboard.",
        }),
      });
      if (res.ok) {
        toast.success("Webhook test sent successfully");
      } else {
        toast.error(`Webhook returned HTTP ${res.status}`);
      }
    } catch {
      toast.error("Failed to send webhook test");
    } finally {
      setWebhookTesting(false);
    }
  };

  // Rules Management
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [rules, setRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [tokens, setTokens] = useState<any[]>([]);

  const loadRulesForAllTokens = useCallback(async () => {
    setRulesLoading(true);
    try {
      const tokensData = await fetchTokens();
      setTokens(tokensData || []);
      const allRules: any[] = [];
      let failedTokens = 0;
      for (const token of tokensData || []) {
        try {
          const tokenRules = await fetchRules(token.id);
          for (const rule of tokenRules || []) {
            allRules.push({ ...rule, token_email: token.email });
          }
        } catch (err: any) {
          failedTokens += 1;
          console.warn(`[rules] Failed to load rules for token ${token.email}:`, err?.message || err);
        }
      }
      setRules(allRules);
      if (failedTokens > 0 && allRules.length === 0) {
        toast.error("Failed to load rules", {
          description: `Could not fetch rules for ${failedTokens} token(s). Check that the backend is reachable and your session is valid.`,
        });
      } else if (failedTokens > 0) {
        toast(`Loaded ${allRules.length} rules; ${failedTokens} token(s) failed`);
      }
    } catch (err: any) {
      toast.error("Failed to load rules", { description: err?.message || "Unknown error" });
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rulesExpanded) {
      loadRulesForAllTokens();
    }
  }, [rulesExpanded, loadRulesForAllTokens]);

  const handleDeleteRule = async (rule: any) => {
    if (!confirm(`Delete rule "${rule.display_name}" for ${rule.token_email}?`)) return;
    try {
      await deleteRule(rule.id);
      toast.success("Rule deleted");
      loadRulesForAllTokens();
    } catch (err: any) {
      toast.error("Failed to delete rule", { description: err.message });
    }
  };

  const parseConditions = (json: string) => {
    try { return JSON.parse(json); } catch { return {}; }
  };

  const parseActions = (json: string) => {
    try { return JSON.parse(json); } catch { return {}; }
  };

  // Purge
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const purgeMutation = useMutation({
    mutationFn: purgeExpiredTokens,
    onSuccess: (data) => {
      toast.success(`Purged ${data.deleted} expired tokens`);
      setPurgeConfirm(false);
    },
    onError: (err: any) => {
      toast.error(`Purge failed: ${err.message}`);
    },
  });

  const maxTokens = watchAi("max_tokens") || 4000;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DashboardTopBar
        title="Settings"
        subtitle="Manage encryption, AI configuration, stealth, and maintenance"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {!isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center gap-2 text-xs text-amber-400"
            >
              <Shield className="h-4 w-4 flex-shrink-0" />
              Settings are read-only. Contact an administrator to make changes.
            </motion.div>
          )}
          {/* Encryption */}
          <SectionCard title="Encryption" icon={encryptionActive ? Lock : Unlock}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                encryptionActive ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-secondary/50 ring-1 ring-white/5"
              )}>
                {encryptionActive ? <Lock className="h-5 w-5 text-emerald-400" /> : <Unlock className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  End-to-End Response Encryption
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter your master passphrase to decrypt sensitive API responses. This is stored in
                  <strong> sessionStorage</strong> (cleared when the tab closes) for security.
                </p>
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] flex-shrink-0",
                  encryptionActive
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-muted/30 text-muted-foreground border-border"
                )}
              >
                {encryptionActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Master Passphrase
                </label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter your master passphrase..."
                    className="flex-1 bg-secondary/50 border-white/5"
                    autoComplete="off"
                  />
                  <Button size="sm" onClick={handleSavePassphrase} disabled={!passphrase.trim()}>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save
                  </Button>
                  {encryptionActive && (
                    <Button size="sm" variant="outline" onClick={handleClearPassphrase} className="border-white/10">
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Test Decryption
                </label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    value={testCiphertext}
                    onChange={(e) => setTestCiphertext(e.target.value)}
                    placeholder="Paste ciphertext to test..."
                    className="flex-1 bg-secondary/50 border-white/5 text-xs font-mono"
                    autoComplete="off"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTestDecrypt}
                    disabled={!passphrase || !testCiphertext}
                    className="border-white/10 gap-1"
                  >
                    <TestTube className="h-3.5 w-3.5" />
                    Test
                  </Button>
                </div>
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className={cn(
                      "mt-2 rounded-lg border px-3 py-2 text-xs",
                      testResult.success
                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/5 border-rose-500/20 text-rose-400"
                    )}
                  >
                    {testResult.message}
                  </motion.div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* 2FA / Barcode Authentication — Admin only */}
          {isAdmin && (
            <SectionCard title="Barcode 2FA Authentication" icon={QrCode}>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center flex-shrink-0">
                    <QrCode className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When enabled, admin login requires both password and a time-based one-time password (TOTP) from an authenticator app.
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] flex-shrink-0",
                      twoFactorEnabled
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-muted/30 text-muted-foreground border-border"
                    )}
                  >
                    {twoFactorEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    size="sm"
                    variant={twoFactorEnabled ? "outline" : "default"}
                    className={cn("gap-1.5", twoFactorEnabled && "border-white/10")}
                    onClick={() => {
                      setTwoFactorEnabled(!twoFactorEnabled);
                      toast.success(twoFactorEnabled ? "2FA disabled. Login will only require password." : "2FA enabled. A setup QR code will be shown on next login.");
                    }}
                  >
                    {twoFactorEnabled ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
                  </Button>
                </div>

                {twoFactorEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
                  >
                    <p className="text-xs text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                      Save your backup codes securely. If you lose access to your authenticator app, you will need them to recover your account.
                    </p>
                  </motion.div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Change Username — Admin only */}
          {isAdmin && (
            <SectionCard title="Change Username" icon={UserCircle}>
              <div className="space-y-3">
                <div className="rounded-lg border border-white/5 bg-secondary/30 p-3 text-xs text-muted-foreground">
                  Current username: <span className="font-mono text-foreground">{user?.username || "—"}</span>
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    New Username
                  </label>
                  <Input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter new username..."
                    className="bg-secondary/50 border-white/5 mt-1.5"
                    autoComplete="off"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    3–32 characters. Letters, numbers, _, -, or . only.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Current Password (confirm)
                  </label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type={showUsernamePassword ? "text" : "password"}
                      value={usernameCurrentPassword}
                      onChange={(e) => setUsernameCurrentPassword(e.target.value)}
                      placeholder="Enter current password to confirm..."
                      className="flex-1 bg-secondary/50 border-white/5"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setShowUsernamePassword(!showUsernamePassword)}
                    >
                      {showUsernamePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={usernameChanging || !newUsername || !usernameCurrentPassword}
                    onClick={handleChangeUsername}
                  >
                    {usernameChanging && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <UserCircle className="h-3.5 w-3.5" />
                    Change Username
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Change Password — Admin only */}
          {isAdmin && (
            <SectionCard title="Change Password" icon={KeyRound}>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Current Password
                  </label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password..."
                      className="flex-1 bg-secondary/50 border-white/5"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    New Password
                  </label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password..."
                      className="flex-1 bg-secondary/50 border-white/5"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Confirm New Password
                  </label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password..."
                    className="flex-1 bg-secondary/50 border-white/5 mt-1.5"
                    autoComplete="off"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={passwordChanging || !currentPassword || !newPassword || !confirmPassword}
                    onClick={handleChangePassword}
                  >
                    {passwordChanging && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <KeyRound className="h-3.5 w-3.5" />
                    Change Password
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* AI Configuration */}
          <SectionCard title="AI Configuration" icon={Brain}>
            {aiLoading ? (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading settings...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitAi(onSubmitAi)} className="space-y-4" autoComplete="off">
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    OpenAI API Key
                  </label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      {...registerAi("api_key")}
                      type={showApiKey ? "text" : "password"}
                      placeholder="sk-..."
                      className="flex-1 bg-secondary/50 border-white/5 font-mono text-xs"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {aiErrors.api_key && (
                    <p className="text-[11px] text-destructive mt-1">{aiErrors.api_key.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Model
                  </label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <select
                      {...registerAi("model")}
                      className="h-9 flex-1 rounded-lg border border-white/10 bg-secondary/50 px-3 text-xs text-foreground outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50 appearance-none cursor-pointer"
                    >
                      <option value="gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
                      <option value="gpt-4o">GPT-4o (powerful)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Max Tokens: {maxTokens}
                  </label>
                  <input
                    type="range"
                    {...registerAi("max_tokens", { valueAsNumber: true })}
                    min={100}
                    max={8000}
                    step={100}
                    className="w-full mt-2 accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>100</span>
                    <span>4000</span>
                    <span>8000</span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    className="gap-1.5"
                    disabled={!isAdmin || aiSubmitting || saveAiMutation.isPending}
                  >
                    {(aiSubmitting || saveAiMutation.isPending) && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <Save className="h-3.5 w-3.5" />
                    Save AI Settings
                  </Button>
                </div>
              </form>
            )}
          </SectionCard>

          {/* Stealth Settings */}
          <SectionCard title="Stealth Configuration" icon={Shield}>
            {stealthLoading ? (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading stealth config...</p>
              </div>
            ) : stealthConfig ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-secondary/30 border border-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Jitter Min</p>
                    <p className="text-sm font-semibold text-foreground">{stealthConfig.jitter_min_ms}ms</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 border border-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Jitter Max</p>
                    <p className="text-sm font-semibold text-foreground">{stealthConfig.jitter_max_ms}ms</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-secondary/30 border border-white/5 p-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Proxy</p>
                    <p className="text-sm font-semibold text-foreground">
                      {stealthConfig.proxy_enabled ? (stealthConfig.proxy_url || "Enabled") : "Disabled"}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px]",
                      stealthConfig.proxy_enabled
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-muted/30 text-muted-foreground border-border"
                    )}
                  >
                    {stealthConfig.proxy_enabled ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      User-Agent Pool
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {stealthConfig.ua_pool_size} agents
                    </Badge>
                  </div>
                  <ScrollArea className="h-[200px] rounded-lg border border-white/5 bg-secondary/30 p-2">
                    <div className="space-y-1">
                      {stealthConfig.user_agents?.map((ua, i) => (
                        <div
                          key={i}
                          className="text-[10px] text-muted-foreground font-mono px-2 py-1 rounded hover:bg-secondary/50 truncate"
                          title={ua}
                        >
                          {ua}
                        </div>
                      )) || (
                        <p className="text-xs text-muted-foreground px-2">No UA pool data</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Failed to load stealth configuration</p>
            )}
          </SectionCard>

          {/* Notifications */}
          <SectionCard title="Notifications" icon={Activity}>
            <form onSubmit={handleSubmitWebhook(handleTestWebhook)} className="space-y-4" autoComplete="off">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Webhook URL
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive alerts for critical events (token stored, rule created, etc.)
                </p>
                <Input
                  {...registerWebhook("webhook_url")}
                  placeholder="https://hooks.example.com/webhook"
                  className="mt-1.5 bg-secondary/50 border-white/5"
                  autoComplete="off"
                />
                {webhookErrors.webhook_url && (
                  <p className="text-[11px] text-destructive mt-1">{webhookErrors.webhook_url.message}</p>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-white/10"
                  disabled={!isAdmin || webhookTesting}
                >
                  {webhookTesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Test Webhook
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* Rules Management — Admin only */}
          {isAdmin && (
            <SectionCard title="Rules Management" icon={Gavel}>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <ListFilter className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Inbox Rules</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      View and manage all local inbox rules across all tokens.
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20"
                  >
                    {rules.length} rules
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 gap-1.5"
                    onClick={() => setRulesExpanded(!rulesExpanded)}
                  >
                    {rulesExpanded ? <ChevronRight className="h-3.5 w-3.5 rotate-90" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {rulesExpanded ? "Collapse" : "Expand"}
                  </Button>
                  {rulesExpanded && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 gap-1.5"
                      onClick={loadRulesForAllTokens}
                      disabled={rulesLoading}
                    >
                      {rulesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </Button>
                  )}
                </div>

                {rulesExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-2"
                  >
                    {rulesLoading && rules.length === 0 ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : rules.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-white/10 p-4 text-center">
                        <Shield className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">No rules configured</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {rules.map((rule, i) => {
                          const conditions = parseConditions(rule.conditions_json);
                          const actions = parseActions(rule.actions_json);
                          return (
                            <div
                              key={rule.id}
                              className="rounded-lg border border-white/5 bg-secondary/5 p-3 group hover:bg-secondary/10 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-xs font-medium text-foreground">{rule.display_name}</h4>
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
                                    {rule.graph_rule_id ? (
                                      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                                        Graph
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                                        Local
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mb-1">
                                    {rule.token_email}
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {conditions.subjectContains && (
                                      <Badge variant="secondary" className="text-[10px] gap-1">
                                        <ArrowRight className="h-2.5 w-2.5" />
                                        Subject: {conditions.subjectContains.join(", ")}
                                      </Badge>
                                    )}
                                    {actions.moveToFolder && (
                                      <Badge variant="outline" className="text-[10px] gap-1 bg-blue-500/5 text-blue-400 border-blue-500/10">
                                        <Folder className="h-2.5 w-2.5" />
                                        Move: {actions.moveToFolder}
                                      </Badge>
                                    )}
                                    {actions.forwardTo && Array.isArray(actions.forwardTo) && actions.forwardTo.length > 0 && (
                                      <Badge variant="outline" className="text-[10px] gap-1 bg-purple-500/5 text-purple-400 border-purple-500/10">
                                        <Forward className="h-2.5 w-2.5" />
                                        Forward: {actions.forwardTo.map((f: any) => f?.emailAddress?.address || f?.address || "").filter(Boolean).join(", ")}
                                      </Badge>
                                    )}
                                    {actions.forwardAsAttachmentTo && Array.isArray(actions.forwardAsAttachmentTo) && actions.forwardAsAttachmentTo.length > 0 && (
                                      <Badge variant="outline" className="text-[10px] gap-1 bg-purple-500/5 text-purple-400 border-purple-500/10">
                                        <Forward className="h-2.5 w-2.5" />
                                        Fwd-Att: {actions.forwardAsAttachmentTo.map((f: any) => f?.emailAddress?.address || f?.address || "").filter(Boolean).join(", ")}
                                      </Badge>
                                    )}
                                    {actions.redirectTo && Array.isArray(actions.redirectTo) && actions.redirectTo.length > 0 && (
                                      <Badge variant="outline" className="text-[10px] gap-1 bg-purple-500/5 text-purple-400 border-purple-500/10">
                                        <ArrowRight className="h-2.5 w-2.5" />
                                        Redirect: {actions.redirectTo.map((f: any) => f?.emailAddress?.address || f?.address || "").filter(Boolean).join(", ")}
                                      </Badge>
                                    )}
                                    {actions.permanentDelete && (
                                      <Badge variant="outline" className="text-[10px] gap-1 bg-rose-500/5 text-rose-400 border-rose-500/10">
                                        <Trash2 className="h-2.5 w-2.5" />
                                        Perm Delete
                                      </Badge>
                                    )}
                                    {conditions.fromAddresses && Array.isArray(conditions.fromAddresses) && conditions.fromAddresses.length > 0 && (
                                      <Badge variant="secondary" className="text-[10px] gap-1">
                                        <ArrowRight className="h-2.5 w-2.5" />
                                        From: {conditions.fromAddresses.map((a: any) => a?.address || a?.emailAddress?.address || "").filter(Boolean).join(", ")}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleDeleteRule(rule)}
                                  className="p-1.5 rounded-md border border-white/10 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                  title="Delete rule"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Danger Zone — Admin only */}
          {isAdmin && (
            <SectionCard title="Danger Zone" icon={AlertTriangle} danger>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="h-5 w-5 text-rose-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Purge Expired Tokens</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Permanently delete all tokens that have expired and are not revoked. This action
                    cannot be undone.
                  </p>
                </div>
              </div>

              {!purgeConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  onClick={() => setPurgeConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Purge Expired Tokens
                </Button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2"
                >
                  <p className="text-xs text-rose-400">Are you sure?</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => purgeMutation.mutate()}
                    disabled={purgeMutation.isPending}
                  >
                    {purgeMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Yes, Purge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-white/10"
                    onClick={() => setPurgeConfirm(false)}
                  >
                    Cancel
                  </Button>
                </motion.div>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
