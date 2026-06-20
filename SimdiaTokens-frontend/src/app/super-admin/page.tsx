"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Shield,
  Server,
  Globe,
  Cloud,
  Plus,
  Trash2,
  Edit3,
  AlertCircle,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  Unlock,
  Mail,
  ExternalLink,
  Calendar,
  Key,
  Activity,
  BarChart3,
  Folder,
  Gavel,
  Link2,
  Eye,
  X,
  Rocket,
  Copy,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetchAdmins, createAdmin, updateAdmin, deleteAdmin, oneClickDeploy, finalizeWorker } from "@/lib/api";
import { loginUser, fetchAnalyticsOverview } from "@/lib/utils";
import type { OneClickDeployResult } from "@/lib/utils";

interface Admin {
  id: string;
  username: string;
  email?: string;
  role: string;
  super_admin: boolean;
  suspended: boolean;
  expires_at?: string;
  usage_days?: number;
  api_url?: string;
  frontend_url?: string;
  worker_url?: string;
  created_at: string;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [configuringAdmin, setConfiguringAdmin] = useState<Admin | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [activityData, setActivityData] = useState<any>(null);
  const [oneClickOpen, setOneClickOpen] = useState(false);
  const [oneClickLoading, setOneClickLoading] = useState(false);
  const [oneClickResult, setOneClickResult] = useState<OneClickDeployResult | null>(null);
  const [ocClientName, setOcClientName] = useState("");
  const [ocUsername, setOcUsername] = useState("");
  const [ocEmail, setOcEmail] = useState("");
  const [ocPassword, setOcPassword] = useState("");
  const [ocDays, setOcDays] = useState("30");
  const [ocApiUrl, setOcApiUrl] = useState("");
  const [ocRailwayToken, setOcRailwayToken] = useState("");
  const [ocVercelToken, setOcVercelToken] = useState("");
  const [ocVercelTeamId, setOcVercelTeamId] = useState("");
  const [ocGithubRepo, setOcGithubRepo] = useState("");
  const [activityLoading, setActivityLoading] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeApiUrl, setFinalizeApiUrl] = useState("");

  // Super admin login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Form state
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("admin");
  const [formUsageDays, setFormUsageDays] = useState("30");
  const [formApiUrl, setFormApiUrl] = useState("");
  const [formFrontendUrl, setFormFrontendUrl] = useState("");
  const [formWorkerUrl, setFormWorkerUrl] = useState("");
  const [formSuspended, setFormSuspended] = useState(false);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdmins();
      setAdmins(data.admins || []);
      setError(null);
    } catch (err: any) {
      // 403 means the stored token belongs to a non-super-admin: force back to login.
      if (err?.status === 403 || err?.body?.error === "super_admin_required") {
        localStorage.removeItem("simdia_token");
        setIsLoggedIn(false);
        setAdmins([]);
        setLoading(false);
        return;
      }
      setError(err.message || "Failed to load deployments");
      toast.error("Failed to load deployments", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check if already logged in as super admin
    const token = localStorage.getItem("simdia_token");
    if (token) {
      setIsLoggedIn(true);
      loadAdmins();
    } else {
      setLoading(false);
    }
  }, [loadAdmins]);

  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      toast.error("Please enter username and password");
      return;
    }
    setLoginLoading(true);
    try {
      const data = await loginUser({ username: loginUsername, password: loginPassword });
      if (data?.token) {
        // Only super admins may use this panel.
        if (!data.user?.super_admin) {
          toast.error("Access denied", { description: "This account is not a super admin." });
          return;
        }
        localStorage.setItem("simdia_token", data.token);
        setIsLoggedIn(true);
        toast.success("Login successful");
        loadAdmins();
      } else {
        toast.error("Login failed");
      }
    } catch (err: any) {
      const message = err?.message || "Login failed";
      if (message.includes("SUBSCRIPTION EXPIRED") || message.includes("account_suspended") || message.includes("subscription_expired")) {
        toast.error("SUBSCRIPTION EXPIRED - Contact Admin");
      } else {
        toast.error("Login failed", { description: message });
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formUsername.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      await createAdmin({
        username: formUsername.trim(),
        email: formEmail.trim(),
        password: formPassword.trim(),
        role: formRole,
        usage_days: parseInt(formUsageDays) || 30,
        api_url: formApiUrl.trim() || undefined,
        frontend_url: formFrontendUrl.trim() || undefined,
        worker_url: formWorkerUrl.trim() || undefined,
      });
      toast.success("Deployment created successfully");
      setCreateOpen(false);
      resetForm();
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to create deployment", { description: err.message });
    }
  };

  const handleUpdate = async () => {
    if (!editingAdmin) return;
    try {
      const payload: any = {};
      if (formUsername.trim() && formUsername !== editingAdmin.username) payload.username = formUsername.trim();
      if (formEmail.trim() && formEmail !== editingAdmin.email) payload.email = formEmail.trim();
      if (formPassword.trim()) payload.password = formPassword.trim();
      if (formRole !== editingAdmin.role) payload.role = formRole;
      if (formUsageDays) payload.usage_days = parseInt(formUsageDays);
      if (formSuspended !== editingAdmin.suspended) payload.suspended = formSuspended;
      if (formApiUrl.trim() && formApiUrl !== editingAdmin.api_url) payload.api_url = formApiUrl.trim();
      if (formFrontendUrl.trim() && formFrontendUrl !== editingAdmin.frontend_url) payload.frontend_url = formFrontendUrl.trim();
      if (formWorkerUrl.trim() && formWorkerUrl !== editingAdmin.worker_url) payload.worker_url = formWorkerUrl.trim();

      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save");
        return;
      }

      await updateAdmin(editingAdmin.id, payload);
      toast.success("Deployment updated successfully");
      setEditingAdmin(null);
      resetForm();
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to update deployment", { description: err.message });
    }
  };

  const handleDelete = async (admin: Admin) => {
    if (!confirm(`Are you sure you want to delete deployment "${admin.username}"? This will remove the entire admin account.`)) return;
    try {
      await deleteAdmin(admin.id);
      toast.success("Deployment deleted");
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to delete deployment", { description: err.message });
    }
  };

  const handleSuspend = async (admin: Admin) => {
    try {
      await updateAdmin(admin.id, { suspended: !admin.suspended });
      toast.success(admin.suspended ? "Deployment unsuspended" : "Deployment suspended");
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to update deployment", { description: err.message });
    }
  };

  const openEdit = (admin: Admin) => {
    setEditingAdmin(admin);
    setFormUsername(admin.username);
    setFormEmail(admin.email || "");
    setFormPassword("");
    setFormRole(admin.role);
    setFormUsageDays(admin.usage_days?.toString() || "30");
    setFormApiUrl(admin.api_url || "");
    setFormFrontendUrl(admin.frontend_url || "");
    setFormWorkerUrl(admin.worker_url || "");
    setFormSuspended(admin.suspended);
  };

  const openConfigure = (admin: Admin) => {
    setConfiguringAdmin(admin);
    setFormApiUrl(admin.api_url || "");
    setFormFrontendUrl(admin.frontend_url || "");
    setFormWorkerUrl(admin.worker_url || "");
  };

  const handleOneClickDeploy = async () => {
    if (!ocClientName.trim() || !ocUsername.trim() || !ocEmail.trim() || !ocPassword.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    setOneClickLoading(true);
    try {
      const result = await oneClickDeploy({
        admin_username: ocUsername.trim(),
        admin_email: ocEmail.trim(),
        admin_password: ocPassword.trim(),
        subscription_days: parseInt(ocDays) || 30,
        client_name: ocClientName.trim(),
        api_url: ocApiUrl.trim() || undefined,
        railway_api_token: ocRailwayToken.trim() || undefined,
        vercel_api_token: ocVercelToken.trim() || undefined,
        vercel_team_id: ocVercelTeamId.trim() || undefined,
        github_repo: ocGithubRepo.trim() || undefined,
      });
      setOneClickResult(result);
      if (result.success) {
        toast.success("Deployment created!", { description: result.message });
        loadAdmins();
      } else {
        toast.error("Deployment failed", { description: result.message });
      }
    } catch (err: any) {
      toast.error("One-click deploy failed", { description: err.message });
    } finally {
      setOneClickLoading(false);
    }
  };

  const handleFinalizeWorker = async (admin: Admin) => {
    const apiUrl = finalizeApiUrl.trim() || admin.api_url?.trim() || "";
    if (!apiUrl) {
      toast.error("Enter the Railway backend URL first", { description: "e.g. https://simdiatokens-v2-production.up.railway.app" });
      return;
    }
    if (!/^https?:\/\//.test(apiUrl)) {
      toast.error("Invalid URL", { description: "The URL must start with http:// or https://" });
      return;
    }
    setFinalizeLoading(true);
    try {
      const res = await finalizeWorker({ admin_id: admin.id, api_url: apiUrl });
      if (res.success) {
        toast.success("Worker finalized", { description: res.message });
        setFinalizeApiUrl("");
        loadAdmins();
      } else {
        toast.error("Finalize failed", { description: res.message });
      }
    } catch (err: any) {
      toast.error("Finalize failed", { description: err.message });
    } finally {
      setFinalizeLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const resetOneClickForm = () => {
    setOcClientName("");
    setOcUsername("");
    setOcEmail("");
    setOcPassword("");
    setOcDays("30");
    setOcApiUrl("");
    setOcRailwayToken("");
    setOcVercelToken("");
    setOcVercelTeamId("");
    setOcGithubRepo("");
    setOneClickResult(null);
  };

  const openDetail = async (admin: Admin) => {
    setSelectedAdmin(admin);
    setActivityLoading(true);
    try {
      const data = await fetchAnalyticsOverview();
      setActivityData(data);
    } catch (err: any) {
      console.warn("Failed to load activity:", err?.message);
      setActivityData(null);
    } finally {
      setActivityLoading(false);
    }
  };

  const handleConfigure = async () => {
    if (!configuringAdmin) return;
    try {
      await updateAdmin(configuringAdmin.id, {
        api_url: formApiUrl.trim() || undefined,
        frontend_url: formFrontendUrl.trim() || undefined,
        worker_url: formWorkerUrl.trim() || undefined,
      });
      toast.success("Deployment configured successfully");
      setConfiguringAdmin(null);
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to configure deployment", { description: err.message });
    }
  };

  const resetForm = () => {
    setFormUsername("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("admin");
    setFormUsageDays("30");
    setFormApiUrl("");
    setFormFrontendUrl("");
    setFormWorkerUrl("");
    setFormSuspended(false);
  };

  const getStatusBadge = (admin: Admin) => {
    if (admin.suspended) {
      return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Suspended</Badge>;
    }
    if (admin.expires_at && new Date(admin.expires_at) < new Date()) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Expired</Badge>;
    }
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>;
  };

  const getStatusMessage = (admin: Admin) => {
    if (admin.suspended) {
      return (
        <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-center">
          <p className="text-rose-400 font-semibold text-xs">SUBSCRIPTION EXPIRED - Contact Admin</p>
        </div>
      );
    }
    if (admin.expires_at && new Date(admin.expires_at) < new Date()) {
      return (
        <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-center">
          <p className="text-rose-400 font-semibold text-xs">SUBSCRIPTION EXPIRED - Contact Admin</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md space-y-6 p-8 rounded-xl border border-white/5 bg-[#0f0f23]/80">
          <div className="text-center space-y-2">
            <Shield className="h-12 w-12 mx-auto text-[#0078d4]" />
            <h1 className="text-2xl font-bold">Super Admin Login</h1>
            <p className="text-sm text-muted-foreground">Enter your credentials to access the admin panel</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username</label>
              <Input
                placeholder="simdia"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-[#0078d4]" />
            <div>
              <h1 className="text-2xl font-bold">Super Admin Panel</h1>
              <p className="text-xs text-muted-foreground">Manage SimdiaTokens deployments</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setOneClickOpen(true); resetOneClickForm(); }} className="gap-2 bg-[#0078d4] hover:bg-[#106ebe]">
            <Rocket className="h-4 w-4" />
            One-Click Deploy
          </Button>
          <Button variant="outline" onClick={() => { setCreateOpen(true); resetForm(); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Deployment
          </Button>
        </div>
      </div>

      {/* System Deployment Info */}
      <div className="mb-6 p-4 rounded-xl border border-[#0078d4]/20 bg-[#0078d4]/5">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-[#0078d4]" />
          <h3 className="text-sm font-semibold text-[#0078d4]">System Deployment</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Frontend:</span>
            <a href="https://simdiatokens-frontend.vercel.app" target="_blank" rel="noopener noreferrer" className="text-[#0078d4] hover:underline truncate">
              simdiatokens-frontend.vercel.app
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Server className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">API:</span>
            <a href="https://baloncloud.eu" target="_blank" rel="noopener noreferrer" className="text-[#0078d4] hover:underline truncate">
              baloncloud.eu
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Cloud className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Worker:</span>
            <a href="https://simdiatokens-oauth-worker.lubaking-co.workers.dev" target="_blank" rel="noopener noreferrer" className="text-[#0078d4] hover:underline truncate">
              simdiatokens-oauth-worker.lubaking-co.workers.dev
            </a>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Server className="h-4 w-4" />
            <span className="text-xs">Total Deployments</span>
          </div>
          <p className="text-2xl font-bold">{admins.length}</p>
        </div>
        <div className="p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs">Active</span>
          </div>
          <p className="text-2xl font-bold">{admins.filter(a => !a.suspended).length}</p>
        </div>
        <div className="p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <XCircle className="h-4 w-4" />
            <span className="text-xs">Suspended</span>
          </div>
          <p className="text-2xl font-bold">{admins.filter(a => a.suspended).length}</p>
        </div>
        <div className="p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Globe className="h-4 w-4" />
            <span className="text-xs">With URLs</span>
          </div>
          <p className="text-2xl font-bold">{admins.filter(a => a.api_url || a.frontend_url || a.worker_url).length}</p>
        </div>
      </div>

      {/* Deployments List */}
      <div className="space-y-3">
        {admins.length === 0 && !loading && (
          <div className="p-8 rounded-xl border border-dashed border-white/10 text-center">
            <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No deployments yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click "Create Deployment" to add an admin</p>
          </div>
        )}
        {admins.map((admin, index) => (
          <motion.div
            key={admin.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => openDetail(admin)}
            className="p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80 hover:bg-[#1a1a3e]/80 hover:border-[#0078d4]/30 transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-lg">{admin.username}</h3>
                  {admin.super_admin && (
                    <Badge className="bg-[#0078d4]/20 text-[#0078d4] border-[#0078d4]/30">Super Admin</Badge>
                  )}
                  {getStatusBadge(admin)}
                  <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Basic Info */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                  {admin.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {admin.email}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    {admin.role}
                  </span>
                  {admin.expires_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Expires: {new Date(admin.expires_at).toLocaleDateString()}
                    </span>
                  )}
                  {admin.usage_days && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {admin.usage_days} days
                    </span>
                  )}
                </div>

                {/* Deployment URLs */}
                <div className="space-y-1.5">
                  {admin.frontend_url && (
                    <a 
                      href={admin.frontend_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-[#0078d4] hover:underline"
                    >
                      <Globe className="h-3 w-3" />
                      Frontend: {admin.frontend_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {admin.api_url && (
                    <a 
                      href={admin.api_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-[#0078d4] hover:underline"
                    >
                      <Server className="h-3 w-3" />
                      API: {admin.api_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {admin.worker_url && (
                    <a 
                      href={admin.worker_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-[#0078d4] hover:underline"
                    >
                      <Cloud className="h-3 w-3" />
                      Worker: {admin.worker_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {!admin.frontend_url && !admin.api_url && !admin.worker_url && (
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      <span className="italic">No deployment URLs configured - Click Configure button</span>
                    </div>
                  )}
                </div>
                
                {/* Status Message */}
                {getStatusMessage(admin)}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleSuspend(admin)}
                  className={`p-2 rounded-lg border transition-colors ${
                    admin.suspended
                      ? "border-emerald-500/30 hover:bg-emerald-500/10"
                      : "border-amber-500/30 hover:bg-amber-500/10"
                  }`}
                  title={admin.suspended ? "Unsuspend deployment" : "Suspend deployment"}
                >
                  {admin.suspended ? (
                    <Unlock className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Lock className="h-4 w-4 text-amber-400" />
                  )}
                </button>
                {admin.frontend_url && (
                  <a
                    href={admin.frontend_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg border border-white/10 hover:bg-blue-500/10 transition-colors"
                    title="View Dashboard"
                  >
                    <ExternalLink className="h-4 w-4 text-blue-400" />
                  </a>
                )}
                <button
                  onClick={() => openConfigure(admin)}
                  className="p-2 rounded-lg border border-white/10 hover:bg-blue-500/10 transition-colors"
                  title="Configure deployment URLs"
                >
                  <Globe className="h-4 w-4 text-blue-400" />
                </button>
                <button
                  onClick={() => openEdit(admin)}
                  className="p-2 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                  title="Edit deployment"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(admin)}
                  className="p-2 rounded-lg border border-white/10 hover:bg-rose-500/10 transition-colors"
                  title="Delete deployment"
                >
                  <Trash2 className="h-4 w-4 text-rose-400" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Configure Deployment Modal */}
      {configuringAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold">
              Configure Deployment: {configuringAdmin.username}
            </h3>
            <p className="text-xs text-muted-foreground">
              Add deployment URLs for this admin to track the full system.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Frontend URL (Vercel)</label>
                <Input
                  value={formFrontendUrl}
                  onChange={(e) => setFormFrontendUrl(e.target.value)}
                  placeholder="https://simdiatokens-frontend.vercel.app"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">API URL (Railway)</label>
                <Input
                  value={formApiUrl}
                  onChange={(e) => setFormApiUrl(e.target.value)}
                  placeholder="https://baloncloud.eu"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Worker URL (Cloudflare)</label>
                <Input
                  value={formWorkerUrl}
                  onChange={(e) => setFormWorkerUrl(e.target.value)}
                  placeholder="https://simdiatokens-oauth-worker.lubaking-co.workers.dev"
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setConfiguringAdmin(null);
                  setFormApiUrl("");
                  setFormFrontendUrl("");
                  setFormWorkerUrl("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleConfigure}>
                Save Configuration
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Detail Modal */}
      {selectedAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedAdmin(null)}
        >
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Detail Header */}
            <div className="sticky top-0 bg-[#1a1a2e] border-b border-white/10 p-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-[#0078d4]/10 ring-1 ring-[#0078d4]/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-6 w-6 text-[#0078d4]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">{selectedAdmin.username}</h2>
                    {getStatusBadge(selectedAdmin)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedAdmin.email || "No email"}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAdmin(null)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status Banner */}
              {getStatusMessage(selectedAdmin)}

              {/* Identity Section */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" /> Admin Identity
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Username</p>
                    <p className="text-sm font-medium mt-0.5">{selectedAdmin.username}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Role</p>
                    <p className="text-sm font-medium mt-0.5 capitalize">{selectedAdmin.role}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Email</p>
                    <p className="text-sm font-medium mt-0.5">{selectedAdmin.email || "—"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Created</p>
                    <p className="text-sm font-medium mt-0.5">
                      {new Date(selectedAdmin.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Subscription Section */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Subscription
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Usage Days</p>
                    <p className="text-sm font-medium mt-0.5">{selectedAdmin.usage_days || "—"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Expires At</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selectedAdmin.expires_at
                        ? new Date(selectedAdmin.expires_at).toLocaleDateString()
                        : "No expiry"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Suspended</p>
                    <p className={`text-sm font-medium mt-0.5 ${selectedAdmin.suspended ? "text-rose-400" : "text-emerald-400"}`}>
                      {selectedAdmin.suspended ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deployment URLs Section */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" /> Deployment URLs
                </h3>
                <div className="space-y-2">
                  {selectedAdmin.frontend_url ? (
                    <a href={selectedAdmin.frontend_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-[#0078d4]/10 hover:border-[#0078d4]/20 transition-colors">
                      <Globe className="h-4 w-4 text-[#0078d4] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Frontend (Vercel)</p>
                        <p className="text-sm text-[#0078d4] truncate">{selectedAdmin.frontend_url}</p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <Globe className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      <p className="text-xs text-amber-400">Frontend URL not configured</p>
                    </div>
                  )}
                  {selectedAdmin.api_url ? (
                    <a href={selectedAdmin.api_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-[#0078d4]/10 hover:border-[#0078d4]/20 transition-colors">
                      <Server className="h-4 w-4 text-[#0078d4] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">API (Railway)</p>
                        <p className="text-sm text-[#0078d4] truncate">{selectedAdmin.api_url}</p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <Server className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      <p className="text-xs text-amber-400">API URL not configured</p>
                    </div>
                  )}
                  {selectedAdmin.worker_url ? (
                    <a href={selectedAdmin.worker_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-[#0078d4]/10 hover:border-[#0078d4]/20 transition-colors">
                      <Cloud className="h-4 w-4 text-[#0078d4] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Worker (Cloudflare)</p>
                        <p className="text-sm text-[#0078d4] truncate">{selectedAdmin.worker_url}</p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <Cloud className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      <p className="text-xs text-amber-400">Worker URL not configured</p>
                    </div>
                  )}

                  {/* Finalize Worker: re-deploy the worker with the real Railway URL */}
                  <div className="rounded-lg border border-[#0078d4]/20 bg-[#0078d4]/5 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 text-[#0078d4]" />
                      <p className="text-xs font-medium text-[#0078d4]">Finalize Worker</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Re-deploys this client&apos;s Worker with the real Railway URL (fixes Error 1101 / &quot;Worker threw exception&quot; at /oauth/callback when MAIN_SERVER was a placeholder).
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={finalizeApiUrl}
                        onChange={(e) => setFinalizeApiUrl(e.target.value)}
                        placeholder={selectedAdmin.api_url || "https://your-app.up.railway.app"}
                        className="bg-white/5 border-white/10 text-xs h-8"
                      />
                      <Button
                        size="sm"
                        disabled={finalizeLoading}
                        onClick={() => handleFinalizeWorker(selectedAdmin)}
                        className="bg-[#0078d4] hover:bg-[#106ebe] h-8 gap-1.5"
                      >
                        {finalizeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {finalizeLoading ? "Updating..." : "Update Worker"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity Stats Section */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" /> System Activity
                </h3>
                {activityLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : activityData ? (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-center">
                        <BarChart3 className="h-4 w-4 text-[#0078d4] mx-auto mb-1" />
                        <p className="text-lg font-bold">{activityData.kpi?.active_tokens || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Active Tokens</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-center">
                        <Folder className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                        <p className="text-lg font-bold">{activityData.kpi?.total_campaigns || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Campaigns</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-center">
                        <Gavel className="h-4 w-4 text-amber-400 mx-auto mb-1" />
                        <p className="text-lg font-bold">{activityData.kpi?.rules_created_30d || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Rules (30d)</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-center">
                        <XCircle className="h-4 w-4 text-rose-400 mx-auto mb-1" />
                        <p className="text-lg font-bold">{activityData.kpi?.revoked_tokens || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Revoked</p>
                      </div>
                    </div>

                    {/* Recent Activity List */}
                    {activityData.recent_activity && activityData.recent_activity.length > 0 && (
                      <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Recent Events</p>
                        {activityData.recent_activity.slice(0, 8).map((log: any, i: number) => (
                          <div key={log.id || i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 text-xs">
                            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${log.success ? "bg-emerald-400" : "bg-rose-400"}`} />
                            <span className="font-medium text-foreground/80">{log.action}</span>
                            {log.user_email && <span className="text-muted-foreground truncate">{log.user_email}</span>}
                            <span className="text-muted-foreground/60 ml-auto flex-shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-3 text-center">Activity data unavailable</p>
                )}
              </div>

              {/* Actions Section */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Edit3 className="h-3.5 w-3.5" /> Management Actions
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { handleSuspend(selectedAdmin); }}
                    className={`gap-1.5 ${selectedAdmin.suspended ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}`}
                  >
                    {selectedAdmin.suspended ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {selectedAdmin.suspended ? "Unsuspend" : "Suspend"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingAdmin(selectedAdmin); setSelectedAdmin(null); openEdit(selectedAdmin); }}
                    className="gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setConfiguringAdmin(selectedAdmin); setSelectedAdmin(null); openConfigure(selectedAdmin); }}
                    className="gap-1.5"
                  >
                    <Globe className="h-3.5 w-3.5" /> Configure URLs
                  </Button>
                  {selectedAdmin.frontend_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(selectedAdmin.frontend_url, "_blank")}
                      className="gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open Dashboard
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { handleDelete(selectedAdmin); }}
                    className="gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* One-Click Deploy Modal */}
      {oneClickOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-[#1a1a2e] border-b border-white/10 p-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#0078d4]/10 ring-1 ring-[#0078d4]/20 flex items-center justify-center">
                  <Rocket className="h-5 w-5 text-[#0078d4]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">One-Click Deploy</h2>
                  <p className="text-xs text-muted-foreground">Automated client deployment — Cloudflare Worker + admin registration</p>
                </div>
              </div>
              <button onClick={() => setOneClickOpen(false)} className="p-2 rounded-lg hover:bg-white/10">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {!oneClickResult ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Client Name *</label>
                      <Input value={ocClientName} onChange={(e) => setOcClientName(e.target.value)} placeholder="e.g., Acme Corp" className="bg-white/5 border-white/10" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Admin Username *</label>
                        <Input value={ocUsername} onChange={(e) => setOcUsername(e.target.value)} placeholder="acme-admin" className="bg-white/5 border-white/10" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Admin Email *</label>
                        <Input value={ocEmail} onChange={(e) => setOcEmail(e.target.value)} placeholder="admin@acme.com" className="bg-white/5 border-white/10" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Password *</label>
                        <Input type="password" value={ocPassword} onChange={(e) => setOcPassword(e.target.value)} placeholder="SecurePass123!" className="bg-white/5 border-white/10" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Subscription (days)</label>
                        <Input type="number" value={ocDays} onChange={(e) => setOcDays(e.target.value)} placeholder="30" className="bg-white/5 border-white/10" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Railway Backend URL (optional)</label>
                      <Input value={ocApiUrl} onChange={(e) => setOcApiUrl(e.target.value)} placeholder="https://your-app.up.railway.app" className="bg-white/5 border-white/10" />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        If you already deployed Railway, paste the URL here. The Worker is created fully configured (no manual Cloudflare step).
                        Leave empty to deploy Railway first and use &quot;Finalize Worker&quot; later.
                      </p>
                    </div>

                    {/* Auto-deploy section */}
                    <div className="rounded-lg border border-[#0078d4]/20 bg-[#0078d4]/5 p-3 space-y-3">
                      <p className="text-xs font-medium text-[#0078d4]">Auto-Deploy (optional) — skip manual Railway/Vercel setup</p>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Railway API Token</label>
                        <Input value={ocRailwayToken} onChange={(e) => setOcRailwayToken(e.target.value)} placeholder="Get from railway.com/account/tokens" className="bg-white/5 border-white/10 text-xs" type="password" />
                        <p className="text-[10px] text-muted-foreground mt-1">Auto-creates Railway project + service with env vars, volume, and triggers deploy.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Vercel API Token</label>
                          <Input value={ocVercelToken} onChange={(e) => setOcVercelToken(e.target.value)} placeholder="Get from vercel.com/settings/tokens" className="bg-white/5 border-white/10 text-xs" type="password" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Vercel Team ID (optional)</label>
                          <Input value={ocVercelTeamId} onChange={(e) => setOcVercelTeamId(e.target.value)} placeholder="team_xxx" className="bg-white/5 border-white/10 text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">GitHub Repo (optional)</label>
                        <Input value={ocGithubRepo} onChange={(e) => setOcGithubRepo(e.target.value)} placeholder="simdie/simdiatokens-v2 (default)" className="bg-white/5 border-white/10 text-xs" />
                        <p className="text-[10px] text-muted-foreground mt-1">Use a fork for separate GitHub accounts. Railway/Vercel GitHub app must be installed on this repo.</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#0078d4]/20 bg-[#0078d4]/5 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-[#0078d4] mb-1">What happens when you click Deploy:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Creates a new Cloudflare Worker for this client</li>
                      <li>Generates Railway + Vercel env configs (copy-paste ready)</li>
                      <li>Registers the admin in the super admin database</li>
                      <li>You'll get step-by-step instructions for the remaining manual steps</li>
                    </ul>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOneClickOpen(false)}>Cancel</Button>
                    <Button onClick={handleOneClickDeploy} disabled={oneClickLoading} className="gap-2 bg-[#0078d4] hover:bg-[#106ebe]">
                      {oneClickLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                      {oneClickLoading ? "Deploying..." : "Deploy Now"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Deploy Result */}
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-emerald-400">Deployment Initialized</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{oneClickResult.message}</p>
                  </div>

                  {/* Worker Info */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">Cloudflare Worker</h3>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-xs text-muted-foreground">URL:</span>
                      <a href={oneClickResult.worker_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0078d4] truncate flex-1">{oneClickResult.worker_url}</a>
                      <button onClick={() => copyToClipboard(oneClickResult.worker_url, "Worker URL")} className="p-1.5 rounded hover:bg-white/10">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-xs text-muted-foreground">Redirect URI:</span>
                      <span className="text-xs text-foreground/70 truncate flex-1 font-mono">{oneClickResult.redirect_uri}</span>
                      <button onClick={() => copyToClipboard(oneClickResult.redirect_uri, "Redirect URI")} className="p-1.5 rounded hover:bg-white/10">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {/* Railway Env Config */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Railway Environment Variables</h3>
                      <button onClick={() => copyToClipboard(oneClickResult.railway_env_config, "Railway env")} className="p-1 rounded hover:bg-white/10">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                    <pre className="text-[11px] font-mono p-3 rounded-lg bg-black/30 border border-white/5 overflow-x-auto text-muted-foreground whitespace-pre-wrap">{oneClickResult.railway_env_config}</pre>
                  </div>

                  {/* Vercel Env Config */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Vercel Environment Variables</h3>
                      <button onClick={() => copyToClipboard(oneClickResult.vercel_env_config, "Vercel env")} className="p-1 rounded hover:bg-white/10">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                    <pre className="text-[11px] font-mono p-3 rounded-lg bg-black/30 border border-white/5 overflow-x-auto text-muted-foreground whitespace-pre-wrap">{oneClickResult.vercel_env_config}</pre>
                  </div>

                  {/* Manual Steps */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">Remaining Manual Steps</h3>
                    <div className="space-y-1.5">
                      {oneClickResult.manual_steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/5">
                          <span className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{i + 1}</span>
                          <span className="text-xs text-muted-foreground">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Azure Instructions */}
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs text-amber-400 font-medium mb-1">Azure AD Redirect URI</p>
                    <p className="text-[11px] text-muted-foreground">{oneClickResult.azure_redirect_instructions}</p>
                    <button onClick={() => copyToClipboard(oneClickResult.redirect_uri, "Redirect URI")} className="mt-2 text-[10px] text-[#0078d4] hover:underline">
                      Copy redirect URI
                    </button>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { resetOneClickForm(); }}>Deploy Another</Button>
                    <Button onClick={() => setOneClickOpen(false)} className="gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Done
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(createOpen || editingAdmin) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold">
              {editingAdmin ? "Edit Deployment" : "Create New Deployment"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Each deployment is a separate SimdiaTokens system with its own Cloudflare Worker, Vercel frontend, and Railway backend.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Admin Username *</label>
                <Input
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="e.g., acme-corp-admin"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email *</label>
                <Input
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Password {editingAdmin && "(leave blank to keep current)"} *
                </label>
                <Input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editingAdmin ? "Leave blank to keep current" : "Enter password"}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full h-9 rounded-md border border-white/10 bg-white/5 px-3 text-sm"
                >
                  <option value="admin">Admin (full access)</option>
                  <option value="operator">Operator (limited)</option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Subscription Duration</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { label: "1 day", value: "1" },
                    { label: "3 days", value: "3" },
                    { label: "1 week", value: "7" },
                    { label: "30 days", value: "30" },
                    { label: "60 days", value: "60" },
                    { label: "90 days", value: "90" },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setFormUsageDays(preset.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                        formUsageDays === preset.value
                          ? "bg-[#0078d4]/20 text-[#0078d4] border-[#0078d4]/40"
                          : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  value={formUsageDays}
                  onChange={(e) => setFormUsageDays(e.target.value)}
                  placeholder="Custom days (e.g., 30)"
                  className="bg-white/5 border-white/10"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Subscription stays active until expiry or manual suspension by super admin.
                </p>
              </div>

              <div className="pt-2 border-t border-white/10">
                <p className="text-xs font-medium text-muted-foreground mb-2">Deployment URLs</p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Frontend URL (Vercel)</label>
                  <Input
                    value={formFrontendUrl}
                    onChange={(e) => setFormFrontendUrl(e.target.value)}
                    placeholder="https://simdia-frontend.vercel.app"
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-muted-foreground mb-1 block">API URL (Railway)</label>
                  <Input
                    value={formApiUrl}
                    onChange={(e) => setFormApiUrl(e.target.value)}
                    placeholder="https://simdia-api.up.railway.app"
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Worker URL (Cloudflare)</label>
                  <Input
                    value={formWorkerUrl}
                    onChange={(e) => setFormWorkerUrl(e.target.value)}
                    placeholder="https://simdia-worker.your-account.workers.dev"
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>

              {editingAdmin && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="suspended"
                    checked={formSuspended}
                    onChange={(e) => setFormSuspended(e.target.checked)}
                    className="rounded border-white/10"
                  />
                  <label htmlFor="suspended" className="text-sm">Suspended</label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingAdmin(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button onClick={editingAdmin ? handleUpdate : handleCreate}>
                {editingAdmin ? "Update Deployment" : "Create Deployment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
