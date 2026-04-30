"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { TokenTable } from "@/components/dashboard/token-table";
import { DashboardTopBar } from "@/components/dashboard/top-bar";
import { StatsCardsSkeleton } from "@/components/ui/loading-skeleton";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { fetchTokens } from "@/lib/api";
import { useCallback } from "react";
import { Token } from "@/types/token";

export default function DashboardPage() {
  const {
    data: tokens = [],
    isLoading: loading,
    dataUpdatedAt,
    refetch,
    isError,
  } = useQuery({
    queryKey: ["tokens"],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "https://simdiatokens-server-production.up.railway.app"}/api/tokens`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    },
    refetchInterval: 15_000,
    retry: 0,
  });

  const loadTokens = useCallback(() => {
    refetch();
  }, [refetch]);

  useKeyboardShortcuts({
    "ctrl+r": loadTokens,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DashboardTopBar title="Dashboard" subtitle="Manage and monitor all harvested OAuth2 tokens from your campaigns" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            {loading && tokens.length === 0 ? (
              <StatsCardsSkeleton />
            ) : (
              <StatsCards tokens={tokens} isLoading={false} />
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <TokenTable
              tokens={tokens}
              loading={loading}
              onRefresh={loadTokens}
              lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
            />
          </motion.div>

          <div className="mt-4 text-center">
            <p className="text-[10px] text-muted-foreground/50">
              <kbd className="px-1 py-0.5 rounded bg-secondary/40 text-[9px] font-mono">Ctrl+R</kbd> Refresh &nbsp;
              <kbd className="px-1 py-0.5 rounded bg-secondary/40 text-[9px] font-mono">Ctrl+K</kbd> Quick search
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
