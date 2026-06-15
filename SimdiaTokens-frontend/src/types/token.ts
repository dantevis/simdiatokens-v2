export interface Token {
  id: string;
  email: string;
  refresh_token: string;
  expires_at: string;
  source: string;
  created_at?: string;
  updated_at?: string;
  last_activity?: string;
  ip_address?: string;
  location?: string;
  tenant_id?: string;
  category?: string;
  account_type?: "consumer" | "enterprise" | string;
  last_refreshed_at?: string;
  status?: "active" | "revoked" | "expired" | string;
  session_status?: "active" | "pending" | "expired" | "killed" | string;
  session_active_at?: string;
  session_killed_at?: string;
}

export interface GraphMessage {
  id: string;
  subject: string;
  conversationId?: string;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  receivedDateTime: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  body?: {
    contentType: string;
    content: string;
  };
}

export interface InboxResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
}

export type SortField = "email" | "expires_at" | "created_at" | "source";
export type SortDirection = "asc" | "desc";

export interface TokenFilters {
  search: string;
  status: "all" | "active" | "expired";
  source: string;
}

// === Recon / Graph API types ===

export interface GraphUser {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  userPrincipalName?: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
  companyName?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  streetAddress?: string;
  employeeId?: string;
  createdDateTime?: string;
  accountEnabled?: boolean;
}

export interface GraphGroup {
  id: string;
  displayName?: string;
  description?: string;
  mail?: string;
  visibility?: string;
  groupTypes?: string[];
  createdDateTime?: string;
  membershipRule?: string;
}

export interface GraphManager extends GraphUser {}

export interface DirectReport {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
}

export interface ReconData {
  me: GraphUser | null;
  manager: GraphManager | null;
  directReports: DirectReport[];
  memberOf: GraphGroup[];
  transitiveMemberOf: GraphGroup[];
}

export interface OrganizationSummary {
  tenant_name?: string;
  verified_domains: string[];
}

export interface DirectorySummary {
  total_users?: number;
}

export interface ReconReport {
  target_user: GraphUser;
  manager?: GraphManager;
  direct_reports: DirectReport[];
  groups: GraphGroup[];
  organization: OrganizationSummary;
  directory_summary: DirectorySummary;
}

// === BEC Analysis types ===

export type Severity = "critical" | "high" | "medium" | "low";
export type Complexity = "high" | "medium" | "low";
export type Influence = "high" | "medium" | "low";

export interface BECOpportunity {
  type: string;
  confidence: number;
  description: string;
  involvedParties: string[];
  suggestedAction: string;
}

export interface FinancialThread {
  subject: string;
  amount?: string;
  currency?: string;
  parties: string[];
  date: string;
}

export interface Executive {
  name: string;
  title: string;
  email: string;
  influence: Influence;
}

export interface Deal {
  subject: string;
  parties: string[];
  value?: string;
  stage: string;
  date: string;
}

export interface HighValueTarget {
  name: string;
  email: string;
  reason: string;
}

export interface AttackAngle {
  scenario: string;
  complexity: Complexity;
  successProbability: number;
  description: string;
  prerequisites: string[];
}

export interface BECAnalysisReport {
  summary: string;
  riskScore: number;
  severity: Severity;
  emailCount: number;
  analyzedAt: string;
  opportunities: BECOpportunity[];
  financialThreads: FinancialThread[];
  executives: Executive[];
  deals: Deal[];
  highValueTargets: HighValueTarget[];
  attackAngles: AttackAngle[];
}

// === Conversation-based BEC Scan types ===

export interface BECMessageInConversation {
  id: string;
  subject: string;
  sender: string;
  sender_email: string;
  received_date: string;
  body_preview: string;
  is_read: boolean;
  has_attachments: boolean;
}

export interface BECConversation {
  conversation_id: string;
  subject: string;
  participant_count: number;
  message_count: number;
  keywords_matched: string[];
  messages: BECMessageInConversation[];
  latest_date: string;
}

export interface BECScanReport {
  analyzed_at: string;
  total_conversations: number;
  flagged_conversations: number;
  conversations: BECConversation[];
}

// === Campaign types ===

export interface Campaign {
  id: string;
  name: string;
  client_id: string;
  requested_scopes: string;
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  status: "pending" | "authenticated" | "expired" | "failed" | "revoked";
  created_at: string;
  expires_at: string;
  token_id?: string;
  token_email?: string;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
  total: number;
  page: number;
  per_page: number;
}

export interface CreateCampaignRequest {
  name: string;
  client_id?: string;
  requested_scopes: string[];
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
}

export interface CreateCampaignResponse {
  id: string;
  name: string;
  user_code?: string;
  verification_uri?: string;
  status: string;
  expires_at: string;
}

// === Token Health types ===

export interface TokenHealthResponse {
  active: number;
  expired: number;
  revoked: number;
  total: number;
}

// === Analytics types ===

export interface AnalyticsKpi {
  active_tokens: number;
  revoked_tokens: number;
  total_campaigns: number;
  rules_created_30d: number;
}

export interface TokenTimelineEntry {
  date: string;
  created: number;
  revoked: number;
}

export interface ActionCount {
  action: string;
  count: number;
}

export interface DomainCount {
  domain: string;
  count: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  campaign_id?: string;
  token_id?: string;
  user_email?: string;
  ip_address?: string;
  user_agent?: string;
  details?: string;
  success: boolean;
}

export interface AnalyticsOverview {
  kpi: AnalyticsKpi;
  token_timeline: TokenTimelineEntry[];
  action_distribution: ActionCount[];
  top_domains: DomainCount[];
  recent_activity: AuditLog[];
}

// === Mail Folder types ===

export interface MailFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
  totalItemCount?: number;
  wellKnownName?: string;
}

// === Auth types ===

export type UserRole = "admin" | "operator" | "viewer";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// === Settings types ===

export interface AiSettings {
  api_key: string;
  model: string;
  max_tokens: number;
}

export interface StealthConfig {
  ua_pool_size: number;
  jitter_min_ms: number;
  jitter_max_ms: number;
  proxy_enabled: boolean;
  proxy_url?: string;
  user_agents: string[];
}

export interface TestDecryptRequest {
  passphrase: string;
  ciphertext: string;
}

export interface TestDecryptResponse {
  success: boolean;
  plaintext?: string;
  error?: string;
}

// === Inbox Rule types ===

export interface Rule {
  id: string;
  token_id: string;
  graph_rule_id?: string;
  display_name: string;
  disguise_name: string;
  conditions_json: string;
  actions_json: string;
  target_folder?: string;
  forward_to?: string;
  created_at: string;
  status: string;
}
