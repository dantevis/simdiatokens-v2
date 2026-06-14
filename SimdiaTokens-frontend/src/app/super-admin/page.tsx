"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Shield,
  Users,
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
  Key,
  Calendar,
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
  created_at: string;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("admin");
  const [formUsageDays, setFormUsageDays] = useState("30");
  const [formSuspended, setFormSuspended] = useState(false);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdmins();
      setAdmins(data.admins || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load admins");
      toast.error("Failed to load admins", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

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
      });
      toast.success("Admin created successfully");
      setCreateOpen(false);
      resetForm();
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to create admin", { description: err.message });
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

      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save");
        return;
      }

      await updateAdmin(editingAdmin.id, payload);
      toast.success("Admin updated successfully");
      setEditingAdmin(null);
      resetForm();
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to update admin", { description: err.message });
    }
  };

  const handleDelete = async (admin: Admin) => {
    if (!confirm(`Are you sure you want to delete admin "${admin.username}"?`)) return;
    try {
      await deleteAdmin(admin.id);
      toast.success("Admin deleted");
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to delete admin", { description: err.message });
    }
  };

  const handleSuspend = async (admin: Admin) => {
    try {
      await updateAdmin(admin.id, { suspended: !admin.suspended });
      toast.success(admin.suspended ? "Admin unsuspended" : "Admin suspended");
      loadAdmins();
    } catch (err: any) {
      toast.error("Failed to update admin", { description: err.message });
    }
  };

  const openEdit = (admin: Admin) => {
    setEditingAdmin(admin);
    setFormUsername(admin.username);
    setFormEmail(admin.email || "");
    setFormPassword("");
    setFormRole(admin.role);
    setFormUsageDays(admin.usage_days?.toString() || "30");
    setFormSuspended(admin.suspended);
  };

  const resetForm = () => {
    setFormUsername("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("admin");
    setFormUsageDays("30");
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

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <p className="text-sm text-destructive/80">{error}</p>
          <Button variant="outline" size="sm" onClick={loadAdmins}>Retry</Button>
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
            <h1 className="text-2xl font-bold">Super Admin Panel</h1>
          </div>
        </div>
        <Button onClick={() => { setCreateOpen(true); resetForm(); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Admin
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-xs">Total Admins</span>
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
            <Shield className="h-4 w-4" />
            <span className="text-xs">Super Admins</span>
          </div>
          <p className="text-2xl font-bold">{admins.filter(a => a.super_admin).length}</p>
        </div>
      </div>

      {/* Admin List */}
      <div className="space-y-2">
        {admins.map((admin, index) => (
          <motion.div
            key={admin.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-[#0f0f23]/80 hover:bg-[#1a1a3e]/80 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#0078d4]/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-[#0078d4]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{admin.username}</h3>
                  {admin.super_admin && (
                    <Badge className="bg-[#0078d4]/20 text-[#0078d4] border-[#0078d4]/30">Super Admin</Badge>
                  )}
                  {getStatusBadge(admin)}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  {admin.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {admin.email}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
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
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSuspend(admin)}
                className={`p-2 rounded-lg border transition-colors ${
                  admin.suspended
                    ? "border-emerald-500/30 hover:bg-emerald-500/10"
                    : "border-amber-500/30 hover:bg-amber-500/10"
                }`}
                title={admin.suspended ? "Unsuspend" : "Suspend"}
              >
                {admin.suspended ? (
                  <Unlock className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Lock className="h-4 w-4 text-amber-400" />
                )}
              </button>
              <button
                onClick={() => openEdit(admin)}
                className="p-2 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                title="Edit"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(admin)}
                className="p-2 rounded-lg border border-white/10 hover:bg-rose-500/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-4 w-4 text-rose-400" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {(createOpen || editingAdmin) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              {editingAdmin ? "Edit Admin" : "Create New Admin"}
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Username</label>
                <Input
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Enter username"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <Input
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="Enter email"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Password {editingAdmin && "(leave blank to keep current)"}
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
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="viewer">Viewer</option>
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
              {editingAdmin && (
                <div className="flex items-center gap-2">
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
                {editingAdmin ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
