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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetchAdmins, createAdmin, updateAdmin, deleteAdmin } from "@/lib/api";

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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("simdia_token", data.token);
        setIsLoggedIn(true);
        toast.success("Login successful");
        loadAdmins();
      } else {
        toast.error(data.error || "Login failed");
      }
    } catch (err: any) {
      toast.error("Login failed", { description: err.message });
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
        <Button onClick={() => { setCreateOpen(true); resetForm(); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Deployment
        </Button>
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
        {admins.map((admin, index) => (
          <motion.div
            key={admin.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80 hover:bg-[#1a1a3e]/80 transition-colors"
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
                    <p className="text-xs text-muted-foreground italic">No deployment URLs configured</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
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
                <label className="text-xs text-muted-foreground mb-1 block">Usage Days</label>
                <Input
                  type="number"
                  value={formUsageDays}
                  onChange={(e) => setFormUsageDays(e.target.value)}
                  placeholder="30"
                  className="bg-white/5 border-white/10"
                />
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
