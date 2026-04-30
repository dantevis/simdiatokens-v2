import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  Token,
  InboxResponse,
  GraphUser,
  GraphGroup,
  GraphManager,
  DirectReport,
  BECAnalysisReport,
  Rule,
  ReconReport,
  StoredAnalysis,
  AIAnalysisReport,
  AnalyticsOverview,
  TokenHealthResponse,
  AiSettings,
  StealthConfig,
  TestDecryptResponse,
  LoginRequest,
  LoginResponse,
  AuthUser,
  BECScanReport,
  MailFolder,
} from "@/types/token";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://simdiatokens-server-production.up.railway.app";

/**
 * Fetch with retry mechanism and exponential backoff
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function fetchTokens(): Promise<Token[]> {
  return fetchWithRetry<Token[]>("/api/tokens");
}

export async function fetchInbox(tokenId: string): Promise<InboxResponse> {
  return fetchWithRetry<InboxResponse>(`/api/inbox?token_id=${encodeURIComponent(tokenId)}`);
}

export async function deleteTokens(tokenIds: string[]): Promise<{ success: boolean; deleted: number }> {
  return fetchWithRetry<{ success: boolean; deleted: number }>("/api/tokens", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_ids: tokenIds }),
  });
}

export interface SummarizeRequest {
  messageId: string;
  subject: string;
  body: string;
}

export interface SummarizeResponse {
  summary: string;
}

export async function summarizeEmail(tokenId: string, payload: SummarizeRequest): Promise<SummarizeResponse> {
  return fetchWithRetry<SummarizeResponse>(`/api/summarize?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface CreateRuleRequest {
  ruleName: string;
  condition: {
    field: "subject" | "sender" | "body";
    operator: "contains" | "equals";
    value: string;
  };
  action: {
    type: "forward" | "mark_read" | "delete" | "move_to_folder";
    target?: string;
  };
  messageId?: string;
}

export async function createInboxRule(tokenId: string, payload: CreateRuleRequest): Promise<void> {
  await fetchWithRetry(`/api/create_rule?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ForwardEmailRequest {
  messageId: string;
  to: string;
  comment?: string;
}

export async function forwardEmail(tokenId: string, payload: ForwardEmailRequest): Promise<void> {
  await fetchWithRetry(`/api/forward?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// === Recon / Graph API functions ===

export async function fetchGraphMe(tokenId: string): Promise<GraphUser> {
  return fetchWithRetry<GraphUser>(`/api/graph/me?token_id=${encodeURIComponent(tokenId)}`);
}

export async function fetchDirectReports(tokenId: string): Promise<{ value: DirectReport[] }> {
  return fetchWithRetry<{ value: DirectReport[] }>(`/api/graph/directReports?token_id=${encodeURIComponent(tokenId)}`);
}

export async function fetchMemberOf(tokenId: string): Promise<{ value: GraphGroup[] }> {
  return fetchWithRetry<{ value: GraphGroup[] }>(`/api/graph/memberOf?token_id=${encodeURIComponent(tokenId)}`);
}

export async function fetchTransitiveMemberOf(tokenId: string): Promise<{ value: GraphGroup[] }> {
  return fetchWithRetry<{ value: GraphGroup[] }>(`/api/graph/transitiveMemberOf?token_id=${encodeURIComponent(tokenId)}`);
}

export async function fetchManager(tokenId: string): Promise<GraphManager> {
  return fetchWithRetry<GraphManager>(`/api/graph/manager?token_id=${encodeURIComponent(tokenId)}`);
}

// === BEC Analysis ===

export async function analyzeInbox(tokenId: string): Promise<BECAnalysisReport> {
  return fetchWithRetry<BECAnalysisReport>(`/api/analyze?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "analyze" }),
  });
}

// === Token Refresh ===

export interface RefreshTokenResponse {
  success: boolean;
  new_expires_at?: string;
  message?: string;
}

export async function refreshToken(tokenId: string): Promise<RefreshTokenResponse> {
  return fetchWithRetry<RefreshTokenResponse>(`/api/refresh?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// === Campaign API functions ===

import {
  CampaignListResponse,
  CreateCampaignRequest,
  CreateCampaignResponse,
} from "@/types/token";

export async function fetchCampaigns(
  page = 1,
  perPage = 20,
  status?: string,
  search?: string
): Promise<CampaignListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  return fetchWithRetry<CampaignListResponse>(`/api/campaigns?${params.toString()}`);
}

export async function createCampaign(
  payload: CreateCampaignRequest
): Promise<CreateCampaignResponse> {
  return fetchWithRetry<CreateCampaignResponse>("/api/campaigns/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/campaigns/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
}

// === Inbox Rules ===

export async function fetchRules(tokenId: string): Promise<Rule[]> {
  return fetchWithRetry<Rule[]>(`/api/rules?token_id=${encodeURIComponent(tokenId)}`);
}

// === Recon API ===

export async function runRecon(tokenId: string): Promise<ReconReport> {
  return fetchWithRetry<ReconReport>("/api/recon/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_id: tokenId }),
  });
}

export async function getRecon(tokenId: string): Promise<ReconReport> {
  return fetchWithRetry<ReconReport>(`/api/recon/${encodeURIComponent(tokenId)}`);
}

// === AI Analysis API ===

export async function fetchAIAnalyses(tokenId?: string): Promise<StoredAnalysis[]> {
  const params = new URLSearchParams();
  if (tokenId) params.set("token_id", tokenId);
  return fetchWithRetry<StoredAnalysis[]>(`/api/ai/analyses?${params.toString()}`);
}

export async function triggerAIAnalysis(tokenId: string, messageCount: number): Promise<AIAnalysisReport> {
  return fetchWithRetry<AIAnalysisReport>("/api/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_id: tokenId, message_count: messageCount }),
  });
}

// === Analytics API ===

export async function fetchAnalyticsOverview(from?: string, to?: string): Promise<AnalyticsOverview> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return fetchWithRetry<AnalyticsOverview>(`/api/analytics/overview${query ? "?" + query : ""}`);
}

export async function fetchTokenHealth(): Promise<TokenHealthResponse> {
  return fetchWithRetry<TokenHealthResponse>("/api/tokens/health");
}

// === Settings API ===

export async function fetchAiSettings(): Promise<AiSettings> {
  return fetchWithRetry<AiSettings>("/api/settings/ai");
}

export async function saveAiSettings(payload: AiSettings): Promise<void> {
  await fetchWithRetry("/api/settings/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchStealthConfig(): Promise<StealthConfig> {
  return fetchWithRetry<StealthConfig>("/api/stealth/config");
}

export async function testDecryption(passphrase: string, ciphertext: string): Promise<TestDecryptResponse> {
  return fetchWithRetry<TestDecryptResponse>("/api/test-decrypt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase, ciphertext }),
  });
}

export async function purgeExpiredTokens(): Promise<{ deleted: number }> {
  return fetchWithRetry<{ deleted: number }>("/api/maintenance/purge-expired", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// === BEC Scan API ===

export async function fetchBECScan(tokenId: string): Promise<BECScanReport> {
  return fetchWithRetry<BECScanReport>(`/api/bec/analyze?token_id=${encodeURIComponent(tokenId)}`);
}

// === Inbox Folders API ===

export async function fetchMailFolders(tokenId: string): Promise<{ value: MailFolder[] }> {
  return fetchWithRetry<{ value: MailFolder[] }>(`/api/inbox/folders?token_id=${encodeURIComponent(tokenId)}`);
}

export async function fetchFolderMessages(tokenId: string, folderId: string): Promise<InboxResponse> {
  return fetchWithRetry<InboxResponse>(`/api/inbox/folders/${encodeURIComponent(folderId)}?token_id=${encodeURIComponent(tokenId)}`);
}

// === Auth API ===

export async function loginUser(payload: LoginRequest): Promise<LoginResponse> {
  return fetchWithRetry<LoginResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function registerUser(payload: LoginRequest & { role?: string }): Promise<LoginResponse> {
  return fetchWithRetry<LoginResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchMe(token: string): Promise<AuthUser> {
  return fetchWithRetry<AuthUser>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  }, 0);
}

export async function changePassword(payload: { current_password: string; new_password: string }): Promise<{ success: boolean; message?: string }> {
  return fetchWithRetry<{ success: boolean; message?: string }>("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function generateOAuthLink(): Promise<{ link: string; worker_subdomain: string }> {
  return fetchWithRetry<{ link: string; worker_subdomain: string }>("/api/campaigns/generate-link");
}

export async function deployWorker(): Promise<{ success: boolean; worker_url?: string; message: string }> {
  return fetchWithRetry<{ success: boolean; worker_url?: string; message: string }>("/api/campaigns/deploy-worker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function createFolder(tokenId: string, displayName: string): Promise<MailFolder> {
  return fetchWithRetry<MailFolder>(`/api/inbox/folders?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function sendMail(tokenId: string, payload: { subject: string; body: string; to: string[]; content_type?: string }): Promise<{ success: boolean }> {
  return fetchWithRetry<{ success: boolean }>(`/api/inbox/send?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteMessage(tokenId: string, messageId: string): Promise<{ success: boolean }> {
  return fetchWithRetry<{ success: boolean }>(`/api/inbox/messages/${encodeURIComponent(messageId)}?token_id=${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

// === Local Folders API ===

export async function fetchLocalFolders(tokenId: string): Promise<{ value: { id: string; name: string }[] }> {
  return fetchWithRetry<{ value: { id: string; name: string }[] }>(`/api/inbox/local-folders?token_id=${encodeURIComponent(tokenId)}`);
}

export async function createLocalFolder(tokenId: string, name: string): Promise<{ id: string; name: string }> {
  return fetchWithRetry<{ id: string; name: string }>(`/api/inbox/local-folders?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteLocalFolder(tokenId: string, folderId: string): Promise<{ success: boolean }> {
  return fetchWithRetry<{ success: boolean }>(`/api/inbox/local-folders/${encodeURIComponent(folderId)}?token_id=${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export async function fetchLocalFolderMessages(tokenId: string, folderId: string): Promise<{ value: any[] }> {
  return fetchWithRetry<{ value: any[] }>(`/api/inbox/local-folders/${encodeURIComponent(folderId)}/messages?token_id=${encodeURIComponent(tokenId)}`);
}

export async function runAutoFilter(tokenId: string): Promise<{ success: boolean; moved: number; folder_id: string }> {
  return fetchWithRetry<{ success: boolean; moved: number; folder_id: string }>(`/api/inbox/auto-filter?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function fetchContacts(tokenId: string): Promise<{ value: { id: string; displayName?: string; emailAddresses?: { address?: string; name?: string }[] }[] }> {
  return fetchWithRetry<{ value: { id: string; displayName?: string; emailAddresses?: { address?: string; name?: string }[] }[] }>(`/api/inbox/contacts?token_id=${encodeURIComponent(tokenId)}`);
}

export async function generateLureEmail(payload: {
  target_email: string;
  target_name?: string;
  victim_email: string;
  template_type?: string;
  context?: string;
}): Promise<{ subject: string; body: string; html_body: string; anti_spam_notes: string[] }> {
  return fetchWithRetry<{ subject: string; body: string; html_body: string; anti_spam_notes: string[] }>("/api/lure/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}