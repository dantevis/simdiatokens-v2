"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistanceToNow, isToday, isYesterday, subDays } from "date-fns";
import { toast } from "sonner";
import {
  Token,
  GraphMessage,
  MailFolder,
  Rule,
  GraphUser,
} from "@/types/token";
import {
  fetchTokens,
  fetchInbox,
  fetchMailFolders,
  fetchFolderMessages,
  deleteMessage,
  sendMail,
  markMessageRead,
  moveMessage,
  fetchGraphMe,
  fetchRules,
  createRule,
  deleteRule,
  createFolder,
  fetchLocalFolders,
  createLocalFolder,
  deleteLocalFolder,
  fetchLocalFolderMessages,
  runAutoFilter,
} from "@/lib/api";
import { fileToBase64, cn } from "@/lib/utils";
import ContactsView from "@/components/contacts/contacts-view";
import TasksView from "@/components/tasks/tasks-view";
import OneDriveView from "@/components/onedrive/onedrive-view";
import OutlookSettings from "@/components/settings/outlook-settings";
import OfficeAppsView from "@/components/office/office-apps-view";
import CalendarView from "@/components/calendar/calendar-view";
import { SafeEmailViewer } from "@/components/safe-email";

import {
  Inbox,
  Send,
  Trash2,
  FileText,
  ShieldAlert,
  Shield,
  Archive,
  PenLine,
  Loader2,
  Search,
  Paperclip,
  Star,
  Reply,
  ReplyAll,
  Forward,
  Flag,
  X,
  Check,
  Brain,
  Sparkles,
  Mail,
  MailMinus,
  MailOpen,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clock,
  User,
  Calendar,
  Calendar as CalendarIcon,
  CheckSquare,
  Square,
  Settings,
  FolderPlus,
  Pin,
  PinOff,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Menu,
  Minimize2,
  Maximize2,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Image,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Printer,
  Download,
  Move,
  Copy,
  Edit3,
  Trash,
  RotateCcw,
  Filter,
  SortAsc,
  SortDesc,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Smile,
  Save,
  Bell,
  BellOff,
  Share2,
  Users,
  LayoutList,
  BookOpen,
  HelpCircle,
  LogOut,
  Plus,
  Minus,
  Circle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Hash,
  Clock3,
  BarChart3,
  FileSearch,
  SendHorizontal,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Globe,
  Lock,
  Unlock,
  Zap,
  Wand2,
  Scissors,
  ClipboardCopy,
  ClipboardPaste,
  Undo,
  Redo,
  Strikethrough,
  Subscript,
  Superscript,
  Quote,
  Code,
  Table,
  Indent,
  Outdent,
  Eraser,
  Paintbrush,
  Highlighter,
  Text,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  ListChecks,
  FileDown,
  FileUp,
  FolderOpen,
  FolderClosed,
  Folder,
  Folders,
  FolderTree,
  FolderSync,
  FolderLock,
  FolderHeart,
  FolderArchive,
  FolderCog,
  FolderX,
  FolderCheck,
  FolderMinus,
  FolderGit,
  FolderKanban,
  FolderKey,
  FolderOutput,
  FolderPen,
  FolderRoot,
  FolderSearch,
  FolderSymlink,
  FolderUp,
  FolderClock,
  Home,
  Building,
  Server,
  Briefcase,
  Building2,
  Landmark,
  Store,
  Factory,
  Warehouse,
  Hospital,
  School,
  Church,
  Hotel,
  Castle,
  TreePine,
  TreeDeciduous,
  Palmtree,
  Sprout,
  Flower,
  Leaf,
  Mountain,
  MountainSnow,
  Flame,
  Droplets,
  Waves,
  Wind,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudSun,
  CloudMoon,
  CloudFog,
  SunDim,
  MoonStar,
  Thermometer,
  Snowflake,
  Umbrella,
  Rainbow,
  Tornado,
  Haze,
  Sunrise,
  Sunset,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  ChevronsUp,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ChevronsLeftRight,
  ArrowUpDown,
  ArrowLeftRight,
  Shuffle,
  Repeat,
  Repeat1,
  Repeat2,
  RefreshCw,
  RefreshCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  FlipHorizontal2,
  FlipVertical2,
  Expand,
  Shrink,
  Maximize,
  Minimize,
  MoveHorizontal,
  MoveVertical,
  MoveDiagonal,
  MoveDiagonal2,
  Target,
  Crosshair,
  Scan,
  ScanLine,
  ScanFace,
  ScanEye,
  ScanBarcode,
  QrCode,
  Barcode,
  Fingerprint,
  Footprints,
  Glasses,
  Watch,
  Smartphone,
  Tablet,
  Laptop,
  Monitor,
  Speaker,
  Headphones,
  Camera,
  CameraOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  Mail as MailIcon,
  MailCheck,
  MailQuestion,
  MailWarning,
  MailX,
  MailSearch,
  MailPlus,
  MailSearch as MailScanSearch,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ==========================================
// TYPES
// ==========================================

type ViewMode = "mail" | "calendar" | "people" | "todo" | "onedrive" | "office";
type SortOption = "date" | "from" | "size" | "importance" | "subject";
type SortDirection = "asc" | "desc";
type FilterOption = "all" | "unread" | "flagged" | "hasAttachments" | "from" | "to" | "subject" | "date";

interface ComposePayload {
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  content_type?: string;
  attachments?: { name: string; content_type: string; content_bytes: string }[];
}

interface LocalFolder {
  id: string;
  name: string;
}

interface EmailGroup {
  label: string;
  messages: GraphMessage[];
}

interface ConversationGroup {
  conversationId: string;
  label: string;
  subject: string;
  messages: GraphMessage[];
  latestDate: Date;
  unreadCount: number;
}

// ==========================================
// CONSTANTS
// ==========================================

const WELL_KNOWN_ORDER = [
  "inbox",
  "drafts",
  "sentitems",
  "deleteditems",
  "archive",
  "junkemail",
  "outbox",
  "conversationhistory",
];

const FOLDER_ICON_MAP: Record<string, React.ElementType> = {
  inbox: Inbox,
  drafts: FileText,
  sentitems: Send,
  deleteditems: Trash2,
  junkemail: ShieldAlert,
  archive: Archive,
  outbox: Clock,
  conversationhistory: MessageSquare,
};

const FOLDER_COLOR_MAP: Record<string, string> = {
  inbox: "text-blue-400",
  drafts: "text-amber-400",
  sentitems: "text-emerald-400",
  deleteditems: "text-rose-400",
  junkemail: "text-amber-400",
  archive: "text-violet-400",
  outbox: "text-cyan-400",
  conversationhistory: "text-pink-400",
};

const FOLDER_LABEL_MAP: Record<string, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sentitems: "Sent Items",
  deleteditems: "Deleted Items",
  junkemail: "Junk Email",
  archive: "Archive",
  outbox: "Outbox",
  conversationhistory: "Conversation History",
};

// ==========================================
// UTILS
// ==========================================

function getInitials(name?: string, address?: string): string {
  const str = name || address || "?";
  const parts = str.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return str[0].toUpperCase();
}

function formatOutlookDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, "h:mm a");
  } else if (isYesterday(date)) {
    return "Yesterday";
  } else if (date > subDays(new Date(), 7)) {
    return format(date, "EEE");
  } else {
    return format(date, "MMM d");
  }
}

function groupMessagesByDate(messages: GraphMessage[]): EmailGroup[] {
  const groups: EmailGroup[] = [];
  const today: GraphMessage[] = [];
  const yesterday: GraphMessage[] = [];
  const thisWeek: GraphMessage[] = [];
  const earlier: GraphMessage[] = [];

  for (const msg of messages) {
    const date = new Date(msg.receivedDateTime);
    if (isToday(date)) {
      today.push(msg);
    } else if (isYesterday(date)) {
      yesterday.push(msg);
    } else if (date > subDays(new Date(), 7)) {
      thisWeek.push(msg);
    } else {
      earlier.push(msg);
    }
  }

  if (today.length > 0) groups.push({ label: "Today", messages: today });
  if (yesterday.length > 0) groups.push({ label: "Yesterday", messages: yesterday });
  if (thisWeek.length > 0) groups.push({ label: "Earlier this week", messages: thisWeek });
  if (earlier.length > 0) groups.push({ label: "Earlier", messages: earlier });

  return groups;
}

function groupMessagesByConversation(messages: GraphMessage[]): ConversationGroup[] {
  const conversations = new Map<string, GraphMessage[]>();
  for (const msg of messages) {
    const cid = msg.conversationId || msg.id;
    if (!conversations.has(cid)) {
      conversations.set(cid, []);
    }
    conversations.get(cid)!.push(msg);
  }

  const groups: ConversationGroup[] = [];
  for (const [conversationId, msgs] of conversations) {
    const sorted = [...msgs].sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime());
    const latest = sorted[0];
    const unreadCount = sorted.filter((m) => !m.isRead).length;
    groups.push({
      conversationId,
      label: latest.subject || "(No subject)",
      subject: latest.subject || "(No subject)",
      messages: sorted,
      latestDate: new Date(latest.receivedDateTime),
      unreadCount,
    });
  }

  return groups.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
}

function generateAvatarColor(name?: string): string {
  const colors = [
    "bg-red-500/20 text-red-400",
    "bg-orange-500/20 text-orange-400",
    "bg-amber-500/20 text-amber-400",
    "bg-green-500/20 text-green-400",
    "bg-emerald-500/20 text-emerald-400",
    "bg-teal-500/20 text-teal-400",
    "bg-cyan-500/20 text-cyan-400",
    "bg-sky-500/20 text-sky-400",
    "bg-blue-500/20 text-blue-400",
    "bg-indigo-500/20 text-indigo-400",
    "bg-violet-500/20 text-violet-400",
    "bg-purple-500/20 text-purple-400",
    "bg-fuchsia-500/20 text-fuchsia-400",
    "bg-pink-500/20 text-pink-400",
    "bg-rose-500/20 text-rose-400",
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ==========================================
// COMPONENTS
// ==========================================

// ---- Left Navigation Sidebar ----
function OutlookSidebar({
  folders,
  localFolders,
  activeFolder,
  activeFolderIsLocal,
  onSelectFolder,
  onSelectLocalFolder,
  onCreateLocalFolder,
  onDeleteLocalFolder,
  onCompose,
  onNavigate,
  currentView,
  expandedSections,
  onToggleSection,
  onOpenSettings,
  unreadCount,
  userInfo,
  onDropMessage,
  accountType,
}: {
  folders: MailFolder[];
  localFolders: LocalFolder[];
  activeFolder: string;
  activeFolderIsLocal: boolean;
  onSelectFolder: (id: string) => void;
  onSelectLocalFolder: (id: string) => void;
  onCreateLocalFolder: () => void;
  onDeleteLocalFolder: (id: string) => void;
  onCompose: () => void;
  onNavigate: (view: ViewMode) => void;
  currentView: ViewMode;
  expandedSections: Record<string, boolean>;
  onToggleSection: (section: string) => void;
  onOpenSettings: () => void;
  unreadCount: number;
  userInfo: GraphUser | null;
  onDropMessage?: (folderId: string) => void;
  accountType?: string;
}) {
  const sortedFolders = useMemo(() => {
    const sorted: MailFolder[] = [];
    for (const wk of WELL_KNOWN_ORDER) {
      const f = folders.find((x) => x.wellKnownName === wk);
      if (f) sorted.push(f);
    }
    for (const f of folders) {
      if (!sorted.find((x) => x.id === f.id)) sorted.push(f);
    }
    return sorted;
  }, [folders]);

  const otherFolders = useMemo(() => {
    return sortedFolders.filter((f) => !WELL_KNOWN_ORDER.includes(f.wellKnownName || ""));
  }, [sortedFolders]);

  const wellKnownFolders = useMemo(() => {
    return sortedFolders.filter((f) => WELL_KNOWN_ORDER.includes(f.wellKnownName || ""));
  }, [sortedFolders]);

  return (
    <div className="w-[230px] flex-shrink-0 bg-[#1f1f1f] border-r border-[#3d3d3d] flex flex-col h-full">
      {/* New Mail Button */}
      <div className="p-3">
        <Button
          onClick={onCompose}
          className="w-full gap-2 justify-center bg-[#0f6cbd] hover:bg-[#115ea3] text-white rounded-md shadow-sm transition-colors"
          size="sm"
        >
          <PenLine className="h-4 w-4" />
          <span className="font-semibold">New mail</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto owa-scroll min-h-0">
        <div className="px-2 pb-4 space-y-1">
          {/* Nav Sections */}
          <NavItem
            icon={Inbox}
            label="Mail"
            active={currentView === "mail"}
            onClick={() => onNavigate("mail")}
            badge={unreadCount > 0 ? unreadCount : undefined}
          />
          {accountType !== "consumer" && (
            <NavItem
              icon={Calendar}
              label="Calendar"
              active={currentView === "calendar"}
              onClick={() => onNavigate("calendar")}
            />
          )}
          {accountType !== "consumer" && (
            <NavItem
              icon={Users}
              label="People"
              active={currentView === "people"}
              onClick={() => onNavigate("people")}
            />
          )}
          {accountType !== "consumer" && (
            <NavItem
              icon={CheckSquare}
              label="To Do"
              active={currentView === "todo"}
              onClick={() => onNavigate("todo")}
            />
          )}
          {accountType !== "consumer" && (
            <NavItem
              icon={Cloud}
              label="OneDrive"
              active={currentView === "onedrive"}
              onClick={() => onNavigate("onedrive")}
            />
          )}
          {accountType !== "consumer" && (
            <NavItem
              icon={FileText}
              label="Office Apps"
              active={currentView === "office"}
              onClick={() => onNavigate("office")}
            />
          )}
          {accountType === "enterprise" && (
            <>
              <NavItem
                icon={Building}
                label="Admin Center"
                active={false}
                onClick={() => window.open("https://admin.microsoft.com", "_blank", "noopener,noreferrer")}
              />
              <NavItem
                icon={Server}
                label="Exchange Admin"
                active={false}
                onClick={() => window.open("https://admin.exchange.microsoft.com", "_blank", "noopener,noreferrer")}
              />
            </>
          )}

          <div className="h-px bg-[#3d3d3d] my-2" />

          {/* Favorites */}
          <div className="px-2 py-1">
            <button
              onClick={() => onToggleSection("favorites")}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a0a0a0] uppercase tracking-wider hover:text-[#ffffff] transition-colors w-full"
            >
              {expandedSections.favorites ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Favorites
            </button>
          </div>
          {expandedSections.favorites && (
            <div className="space-y-0.5">
              {wellKnownFolders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isActive={!activeFolderIsLocal && activeFolder === folder.id}
                  onClick={() => { onSelectFolder(folder.id); onNavigate("mail"); }}
                  onDropMessage={onDropMessage}
                />
              ))}
            </div>
          )}

          {/* Folders */}
          <div className="px-2 py-1">
            <button
              onClick={() => onToggleSection("folders")}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a0a0a0] uppercase tracking-wider hover:text-[#ffffff] transition-colors w-full"
            >
              {expandedSections.folders ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Folders
            </button>
          </div>
          {expandedSections.folders && (
            <div className="space-y-0.5">
              {otherFolders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isActive={!activeFolderIsLocal && activeFolder === folder.id}
                  onClick={() => { onSelectFolder(folder.id); onNavigate("mail"); }}
                  onDropMessage={onDropMessage}
                />
              ))}
            </div>
          )}

          {/* Local / Starred Folders */}
          <div className="px-2 py-1 flex items-center justify-between">
            <button
              onClick={() => onToggleSection("local")}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a0a0a0] uppercase tracking-wider hover:text-[#ffffff] transition-colors"
            >
              {expandedSections.local ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Starred
            </button>
            <button
              onClick={onCreateLocalFolder}
              className="text-[11px] text-[#0f6cbd] hover:text-[#60a5fa] transition-colors"
              title="New folder"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {expandedSections.local && (
            <div className="space-y-0.5">
              {localFolders.map((lf) => (
                <div
                  key={lf.id}
                  className={cn(
                    "group flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                    activeFolderIsLocal && activeFolder === lf.id
                      ? "bg-[#1a3a5c] text-[#0f6cbd] font-medium"
                      : "text-[#ffffff] hover:bg-[#252525]"
                  )}
                >
                  <button
                    onClick={() => { onSelectLocalFolder(lf.id); onNavigate("mail"); }}
                    className="flex items-center gap-2.5 flex-1 text-left"
                  >
                    <Star className="h-4 w-4 flex-shrink-0 text-amber-400" />
                    <span className="truncate">{lf.name}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLocalFolder(lf.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-500/20 text-[#a0a0a0] hover:text-rose-400 transition-opacity"
                    title="Delete folder"
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {localFolders.length === 0 && (
                <p className="text-[10px] text-[#a0a0a0] px-3 py-1">No starred folders</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: User + Settings */}
      <div className="p-2 border-t border-[#3d3d3d]">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#252525] transition-colors cursor-pointer">
          <div className="h-7 w-7 rounded-full bg-[#0f6cbd]/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-[#0f6cbd]">
              {getInitials(userInfo?.displayName, userInfo?.mail)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-[#ffffff] truncate">
              {userInfo?.displayName || userInfo?.mail || "User"}
            </p>
            {accountType === "enterprise" && (
              <span className="text-[9px] text-emerald-400 font-medium">Enterprise</span>
            )}
            {accountType === "consumer" && (
              <span className="text-[9px] text-[#a0a0a0]">Consumer</span>
            )}
          </div>
          <button
            onClick={onOpenSettings}
            className="p-1 rounded hover:bg-[#252525] text-[#a0a0a0] hover:text-[#ffffff] transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  disabled,
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
  disabled?: boolean;
  tooltip?: string;
}) {
  const button = (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors",
        active
          ? "bg-[#1a3a5c] text-[#0f6cbd] font-medium"
          : disabled
            ? "text-[#a0a0a0] cursor-not-allowed opacity-60"
            : "text-[#ffffff] hover:bg-[#252525]"
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-[#0f6cbd]" : disabled ? "text-[#a0a0a0]" : "text-[#a0a0a0]")} />
      <span className="flex-1 text-left">{label}</span>
      {badge ? (
        <span className="text-[10px] font-semibold bg-[#0f6cbd]/20 text-[#0f6cbd] px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      ) : null}
    </button>
  );

  if (disabled && tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <span>{button}</span>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-[11px] max-w-[200px]">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

function FolderItem({
  folder,
  isActive,
  onClick,
  onDropMessage,
}: {
  folder: MailFolder;
  isActive: boolean;
  onClick: () => void;
  onDropMessage?: (folderId: string) => void;
}) {
  const wk = folder.wellKnownName || "";
  const Icon = FOLDER_ICON_MAP[wk] || Folder;
  const iconColor = FOLDER_COLOR_MAP[wk] || "text-[#a0a0a0]";
  const label = FOLDER_LABEL_MAP[wk] || folder.displayName;
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <button
      onClick={onClick}
      draggable={false}
      onDragOver={(e) => {
        if (!onDropMessage) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        if (!onDropMessage) return;
        e.preventDefault();
        setIsDragOver(false);
        onDropMessage(folder.id);
      }}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors",
        isDragOver
          ? "bg-[#0f6cbd]/20 border border-[#0f6cbd]/40 ring-1 ring-[#0f6cbd]/20"
          : isActive
          ? "bg-[#1a3a5c] text-[#0f6cbd] font-medium"
          : "text-[#ffffff] hover:bg-[#252525]"
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-[#0f6cbd]" : iconColor)} />
      <span className="flex-1 text-left truncate">{label}</span>
      {isDragOver && (
        <span className="text-[10px] text-[#0f6cbd] font-medium">Drop here</span>
      )}
      {folder.unreadItemCount ? (
        <span className="text-[10px] font-semibold bg-[#0f6cbd]/20 text-[#0f6cbd] px-1.5 py-0.5 rounded-full">
          {folder.unreadItemCount}
        </span>
      ) : null}
    </button>
  );
}

// ---- Command Bar ----
function CommandBar({
  selectedCount,
  onDelete,
  onArchive,
  onReply,
  onReplyAll,
  onForward,
  onMove,
  onMarkRead,
  onMarkUnread,
  onFlag,
  onPin,
  onReport,
  onRecall,
  onResend,
  onShareToTeams,
  onTrackReadReceipts,
  onRules,
  onRefresh,
  refreshing,
  hasSelection,
  conversationMode,
  onToggleConversation,
}: {
  selectedCount: number;
  onDelete: () => void;
  onArchive: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onMove: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onFlag: () => void;
  onPin: () => void;
  onReport: () => void;
  onRecall: () => void;
  onResend: () => void;
  onShareToTeams: () => void;
  onTrackReadReceipts: () => void;
  onRules: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  hasSelection: boolean;
  conversationMode: boolean;
  onToggleConversation: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#3d3d3d] bg-[#1f1f1f]/80 backdrop-blur-sm flex-shrink-0 overflow-x-auto">
      <TooltipProvider delay={200}>
        <CmdBtn icon={Trash2} label="Delete" onClick={onDelete} disabled={!hasSelection} danger />
        <CmdBtn icon={Archive} label="Archive" onClick={onArchive} disabled={!hasSelection} />
        <CmdBtn icon={AlertCircle} label="Report" onClick={onReport} disabled={!hasSelection} />
        <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
        <CmdBtn icon={Reply} label="Reply" onClick={onReply} disabled={!hasSelection} />
        <CmdBtn icon={ReplyAll} label="Reply all" onClick={onReplyAll} disabled={!hasSelection} />
        <CmdBtn icon={Forward} label="Forward" onClick={onForward} disabled={!hasSelection} />
        <CmdBtn icon={Calendar} label="Meeting" onClick={() => {}} disabled={!hasSelection} />
        <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
        <CmdBtn icon={RotateCcw} label="Recall" onClick={onRecall} disabled={!hasSelection} />
        <CmdBtn icon={RefreshCw} label="Resend" onClick={onResend} disabled={!hasSelection} />
        <CmdBtn icon={Share2} label="Teams" onClick={onShareToTeams} disabled={!hasSelection} />
        <CmdBtn icon={Eye} label="Track" onClick={onTrackReadReceipts} disabled={!hasSelection} />
        <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
        <CmdBtn icon={Move} label="Move" onClick={onMove} disabled={!hasSelection} />
        <CmdBtn icon={Flag} label="Flag" onClick={onFlag} disabled={!hasSelection} />
        <CmdBtn icon={Pin} label="Pin" onClick={onPin} disabled={!hasSelection} />
        <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
        <CmdBtn icon={MailOpen} label="Read" onClick={onMarkRead} disabled={!hasSelection} />
        <CmdBtn icon={MailMinus} label="Unread" onClick={onMarkUnread} disabled={!hasSelection} />
        <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
        <CmdBtn icon={Shuffle} label="Rules" onClick={onRules} />
        <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
        <CmdBtn icon={MessageSquare} label={conversationMode ? "Thread" : "List"} onClick={onToggleConversation} />
        <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
        <div className="flex-1" />
        <CmdBtn icon={refreshing ? Loader2 : RefreshCw} label="Refresh" onClick={onRefresh} spinning={refreshing} />
      </TooltipProvider>
    </div>
  );
}

function CmdBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
  spinning,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  spinning?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <button
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6cbd] focus-visible:ring-offset-1 focus-visible:ring-offset-[#1f1f1f]",
            disabled
              ? "text-[#6b6b6b] cursor-not-allowed"
              : danger
              ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              : "text-[#ffffff] hover:bg-[#2d2d2d] hover:text-white"
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
          <span className="hidden lg:inline">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ---- Search Bar ----
function SearchBar({
  value,
  onChange,
  onFilter,
  activeFilter,
}: {
  value: string;
  onChange: (v: string) => void;
  onFilter: (f: FilterOption) => void;
  activeFilter: FilterOption;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[#3d3d3d] bg-[#1f1f1f]/80 backdrop-blur-sm flex-shrink-0">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a0a0a0]" />
        <Input
          placeholder="Search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9 h-8 text-xs bg-[#252525] border-[#3d3d3d] text-[#ffffff] placeholder:text-[#a0a0a0] focus-visible:ring-[#0f6cbd] focus-visible:ring-1"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a0a0a0] hover:text-[#ffffff]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <DropdownMenu>
          <DropdownMenuTrigger>
          <Button variant="ghost" size="sm" className="h-8 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#252525] gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            <span className="capitalize">{activeFilter === "all" ? "All" : activeFilter}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-[#252525] border-[#3d3d3d]">
          <DropdownMenuLabel className="text-[11px] text-[#a0a0a0]">Filter by</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[#2a2e37]" />
          <DropdownMenuCheckboxItem checked={activeFilter === "all"} onCheckedChange={() => onFilter("all")} className="text-[11px] text-[#ffffff]">
            All
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={activeFilter === "unread"} onCheckedChange={() => onFilter("unread")} className="text-[11px] text-[#ffffff]">
            Unread
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={activeFilter === "flagged"} onCheckedChange={() => onFilter("flagged")} className="text-[11px] text-[#ffffff]">
            Flagged
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={activeFilter === "hasAttachments"} onCheckedChange={() => onFilter("hasAttachments")} className="text-[11px] text-[#ffffff]">
            Has attachments
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={activeFilter === "from"} onCheckedChange={() => onFilter("from")} className="text-[11px] text-[#ffffff]">
            From
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={activeFilter === "subject"} onCheckedChange={() => onFilter("subject")} className="text-[11px] text-[#ffffff]">
            Subject
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={activeFilter === "date"} onCheckedChange={() => onFilter("date")} className="text-[11px] text-[#ffffff]">
            Date range
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---- Message List ----
function MessageList({
  messages,
  selectedMessageId,
  onSelectMessage,
  loading,
  sortField,
  sortDirection,
  onSort,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  flaggedIds,
  pinnedIds,
  onToggleFlag,
  onTogglePin,
  conversationMode,
  onDragStart,
  onDragEnd,
}: {
  messages: GraphMessage[];
  selectedMessageId: string | null;
  onSelectMessage: (msg: GraphMessage) => void;
  loading: boolean;
  sortField: SortOption;
  sortDirection: SortDirection;
  onSort: (field: SortOption) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  flaggedIds: Set<string>;
  pinnedIds: Set<string>;
  onToggleFlag: (id: string) => void;
  onTogglePin: (id: string) => void;
  conversationMode?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const groups = useMemo(() => {
    if (conversationMode) {
      return groupMessagesByConversation(messages);
    }
    return groupMessagesByDate(messages);
  }, [messages, conversationMode]);

  const allIds = useMemo(() => messages.map((m) => m.id), [messages]);

  const SortIcon = sortDirection === "asc" ? SortAsc : SortDesc;

  return (
    <div className="w-[380px] flex-shrink-0 border-r border-[#3d3d3d] flex flex-col bg-[#1f1f1f] h-full">
      {/* Sort / Select Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3d3d3d] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedIds.size > 0 && selectedIds.size === allIds.length}
            onCheckedChange={() => {
              if (selectedIds.size === allIds.length) {
                onSelectAll([]);
              } else {
                onSelectAll(allIds);
              }
            }}
            className="border-[#6b6b6b] data-[state=checked]:bg-[#0f6cbd] data-[state=checked]:border-[#0f6cbd]"
          />
          <span className="text-[11px] text-[#a0a0a0]">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${messages.length} messages`}
          </span>
        </div>
        <DropdownMenu>
        <DropdownMenuTrigger>
            <button className="flex items-center gap-1 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
              <SortIcon className="h-3.5 w-3.5" />
              <span className="capitalize">{sortField}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#252525] border-[#3d3d3d]">
            <DropdownMenuLabel className="text-[11px] text-[#a0a0a0]">Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2e37]" />
            {(["date", "from", "size", "importance", "subject"] as SortOption[]).map((field) => (
              <DropdownMenuItem
                key={field}
                onClick={() => onSort(field)}
                className={cn(
                  "text-[11px] capitalize",
                  sortField === field ? "text-[#0f6cbd] font-medium" : "text-[#ffffff]"
                )}
              >
                {field}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto owa-scroll">
        {loading && messages.length === 0 ? (
          <div className="space-y-0">
            {/* Skeleton loading rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-3 py-2.5 border-b border-[#252525]">
                <div className="flex items-start gap-2.5">
                  <div className="h-4 w-4 rounded skeleton-shimmer flex-shrink-0 mt-1" />
                  <div className="h-8 w-8 rounded-full skeleton-shimmer flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-3.5 w-3/4 skeleton-shimmer" />
                    <div className="h-3 w-1/2 skeleton-shimmer" />
                    <div className="h-2.5 w-full skeleton-shimmer" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <MailIcon className="h-8 w-8 text-[#6b6b6b] mb-2" />
            <p className="text-sm text-[#a0a0a0]">No messages found</p>
          </div>
        ) : (
          <div className="divide-y divide-[#252525]">
            <AnimatePresence>
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="sticky top-0 bg-[#1f1f1f] z-10 px-3 py-1 text-[10px] font-semibold text-[#a0a0a0] uppercase tracking-wider border-b border-[#252525]">
                    {group.label}
                  </div>
                  {group.messages.map((msg, i) => {
                    const isSelected = msg.id === selectedMessageId;
                    const isRead = !!msg.isRead;
                    const from = msg.from?.emailAddress;
                    const initials = getInitials(from?.name, from?.address);
                    const isFlagged = flaggedIds.has(msg.id);
                    const isPinned = pinnedIds.has(msg.id);
                    const isSelectedMulti = selectedIds.has(msg.id);
                    const avatarColor = generateAvatarColor(from?.name || from?.address);

                    return (
                      <motion.div
                        key={msg.id}
                        draggable
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.01, duration: 0.15 }}
                        onClick={() => onSelectMessage(msg)}
                        onDragStart={(e) => {
                          (e as unknown as React.DragEvent<HTMLDivElement>).dataTransfer.setData("text/plain", msg.id);
                          (e as unknown as React.DragEvent<HTMLDivElement>).dataTransfer.effectAllowed = "move";
                          onDragStart?.(msg.id);
                        }}
                        onDragEnd={() => {
                          onDragEnd?.();
                        }}
                        className={cn(
                          "group px-3 py-2.5 cursor-pointer transition-colors duration-75 ease-out border-l-[3px]",
                          isSelected
                            ? "bg-[rgba(15,108,189,0.1)] border-l-[#0f6cbd]"
                            : "border-l-transparent hover:bg-[#2d2d2d]"
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Checkbox */}
                          <div className="pt-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelectedMulti}
                              onCheckedChange={() => onToggleSelect(msg.id)}
                              className="border-[#6b6b6b] data-[state=checked]:bg-[#0f6cbd] data-[state=checked]:border-[#0f6cbd]"
                            />
                          </div>

                          {/* Avatar */}
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold",
                              !isRead ? avatarColor : "bg-[#252525] text-[#a0a0a0]"
                            )}
                          >
                            {initials}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={cn(
                                  "text-sm truncate leading-tight",
                                  !isRead ? "font-semibold text-[#ffffff]" : "text-[#a0a0a0]"
                                )}
                              >
                                {from?.name || from?.address || "Unknown"}
                              </p>
                              <span className="text-[10px] text-[#a0a0a0] flex-shrink-0 tabular-nums">
                                {formatOutlookDate(msg.receivedDateTime)}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "text-sm truncate mt-0.5 leading-tight",
                                !isRead ? "font-medium text-[#ffffff]" : "text-[#a0a0a0]/70"
                              )}
                            >
                              {msg.subject || "(No subject)"}
                            </p>
                            <p className="text-[11px] text-[#a0a0a0] truncate mt-0.5 leading-tight">
                              {msg.bodyPreview}
                            </p>
                            {msg.conversationId && (
                              <p className="text-[9px] text-[#0f6cbd] mt-0.5">
                                Thread: {msg.conversationId.slice(0, 8)}...
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              {msg.hasAttachments && (
                                <Paperclip className="h-3 w-3 text-[#a0a0a0]" />
                              )}
                              {!isRead && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0f6cbd]" />
                              )}
                              <div className="flex-1" />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFlag(msg.id);
                                }}
                                className={cn(
                                  "opacity-0 group-hover:opacity-100 transition-opacity duration-75",
                                  isFlagged ? "opacity-100 text-amber-400" : "text-[#a0a0a0] hover:text-amber-400"
                                )}
                              >
                                <Flag className={cn("h-3 w-3", isFlagged && "fill-amber-400")} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePin(msg.id);
                                }}
                                className={cn(
                                  "opacity-0 group-hover:opacity-100 transition-opacity duration-75",
                                  isPinned ? "opacity-100 text-[#0f6cbd]" : "text-[#a0a0a0] hover:text-[#0f6cbd]"
                                )}
                              >
                                <Pin className={cn("h-3 w-3", isPinned && "fill-[#0f6cbd]")} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleSelect(msg.id);
                                }}
                                className={cn(
                                  "opacity-0 group-hover:opacity-100 transition-opacity duration-75",
                                  isSelectedMulti ? "text-[#0f6cbd] opacity-100" : "text-[#a0a0a0]"
                                )}
                              >
                                <Star className={cn("h-3 w-3", isSelectedMulti && "fill-[#0f6cbd]")} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Reading Pane ----
function ReadingPane({
  message,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onArchive,
  onFlag,
  onPin,
  onMove,
  onMarkUnread,
  onSummarize,
  onAnalyze,
  summarizing,
  summary,
  isFlagged,
  isPinned,
  onToggleFlag,
  onTogglePin,
}: {
  message: GraphMessage | null;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onFlag: () => void;
  onPin: () => void;
  onMove: () => void;
  onMarkUnread: () => void;
  onSummarize: () => void;
  onAnalyze: () => void;
  summarizing: boolean;
  summary: string | null;
  isFlagged: boolean;
  isPinned: boolean;
  onToggleFlag: () => void;
  onTogglePin: () => void;
}) {
  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1f1f1f]/50">
        <div className="text-center space-y-3">
          <MailIcon className="h-12 w-12 text-[#3d3d3d] mx-auto" />
          <p className="text-sm text-[#a0a0a0]">Select an item to read</p>
        </div>
      </div>
    );
  }

  const from = message.from?.emailAddress;
  const contentType = message.body?.contentType || "text";
  const bodyContent = message.body?.content || message.bodyPreview || "";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1f1f1f]/50 overflow-hidden">
      {/* Reading Pane Command Bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#3d3d3d] bg-[#1f1f1f]/80 backdrop-blur-sm flex-shrink-0 overflow-x-auto">
<TooltipProvider delay={200}>
          <CmdBtn icon={Reply} label="Reply" onClick={onReply} />
          <CmdBtn icon={ReplyAll} label="Reply all" onClick={onReplyAll} />
          <CmdBtn icon={Forward} label="Forward" onClick={onForward} />
          <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
          <CmdBtn icon={Trash2} label="Delete" onClick={onDelete} danger />
          <CmdBtn icon={Archive} label="Archive" onClick={onArchive} />
          <CmdBtn icon={Move} label="Move" onClick={onMove} />
          <CmdBtn icon={MailMinus} label="Unread" onClick={onMarkUnread} />
          <CmdBtn icon={Printer} label="Print" onClick={() => window.print()} />
          <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
          <CmdBtn
            icon={Flag}
            label={isFlagged ? "Unflag" : "Flag"}
            onClick={onToggleFlag}
          />
          <CmdBtn
            icon={Pin}
            label={isPinned ? "Unpin" : "Pin"}
            onClick={onTogglePin}
          />
          <div className="flex-1" />
          <CmdBtn icon={Sparkles} label="Summarize" onClick={onSummarize} spinning={summarizing} />
          <CmdBtn icon={Brain} label="Analyze" onClick={onAnalyze} />
        </TooltipProvider>
      </div>

      {/* AI Summary */}
      <AnimatePresence>
        {summary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex-shrink-0"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-[11px] font-semibold text-amber-400 uppercase">AI Summary</p>
              <button onClick={onSummarize} className="ml-auto text-[#a0a0a0] hover:text-[#ffffff]">
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xs text-[#ffffff]/80 leading-relaxed">{summary}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email Header */}
      <div className="px-5 py-4 border-b border-[#3d3d3d] flex-shrink-0">
        <div className="flex items-start gap-1 mb-3">
          {isFlagged && <Flag className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />}
          {isPinned && <Pin className="h-4 w-4 text-[#0f6cbd] fill-[#0f6cbd] flex-shrink-0 mt-0.5" />}
          <h2 className="text-lg font-semibold text-[#ffffff] leading-snug">
            {message.subject || "(No subject)"}
          </h2>
        </div>
        <div className="flex items-start gap-3">
          <div className={cn("h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold", generateAvatarColor(from?.name || from?.address))}>
            {getInitials(from?.name, from?.address)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#ffffff]">
                  {from?.name || from?.address || "Unknown"}
                </p>
                <p className="text-xs text-[#a0a0a0]">&lt;{from?.address || "unknown"}&gt;</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {message.toRecipients && message.toRecipients.length > 0 && (
                    <span className="text-[10px] text-[#a0a0a0]">
                      To: {message.toRecipients.map((r) => r.emailAddress?.name || r.emailAddress?.address).filter(Boolean).join(", ")}
                    </span>
                  )}
                  {(message as any).ccRecipients && (message as any).ccRecipients.length > 0 && (
                    <span className="text-[10px] text-[#a0a0a0]">
                      Cc: {(message as any).ccRecipients.map((r: any) => r.emailAddress?.name || r.emailAddress?.address).filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-[#a0a0a0]">
                  {format(new Date(message.receivedDateTime), "EEE, MMM d, yyyy")}
                </p>
                <p className="text-[10px] text-[#a0a0a0]">
                  {format(new Date(message.receivedDateTime), "h:mm a")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] text-[#a0a0a0] bg-[#252525] px-2 py-0.5 rounded">To me</span>
              {message.hasAttachments && (
                <span className="text-[10px] text-[#a0a0a0] bg-[#252525] px-2 py-0.5 rounded flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> Attachments
                </span>
              )}
              {isFlagged && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                  <Flag className="h-3 w-3" /> Flagged
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <SafeEmailViewer
          htmlContent={bodyContent}
          contentType={contentType === "html" ? "html" : "text"}
          className="flex-1 flex flex-col"
        />
      </div>
    </div>
  );
}

// ---- Enterprise Compose Dialog ----
function ComposeDialog({
  open,
  onOpenChange,
  to,
  cc,
  bcc,
  subject,
  body,
  contentType,
  attachments,
  onToChange,
  onCcChange,
  onBccChange,
  onSubjectChange,
  onBodyChange,
  onContentTypeChange,
  onAddAttachments,
  onRemoveAttachment,
  onSend,
  onSaveDraft,
  onDiscard,
  sending,
  tokenEmail,
  replyToMessage,
  onReply,
  onReplyAll,
  onForward,
  onDeleteFromSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  contentType: "HTML" | "Text";
  attachments: File[];
  onToChange: (v: string) => void;
  onCcChange: (v: string) => void;
  onBccChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onContentTypeChange: (v: "HTML" | "Text") => void;
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (idx: number) => void;
  onSend: () => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
  sending: boolean;
  tokenEmail?: string;
  replyToMessage?: GraphMessage | null;
  onReply?: (msg: GraphMessage) => void;
  onReplyAll?: (msg: GraphMessage) => void;
  onForward?: (msg: GraphMessage) => void;
  onDeleteFromSent?: () => void;
}) {
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachmentSize, setAttachmentSize] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Calculate total attachment size
  useEffect(() => {
    const total = attachments.reduce((acc, f) => acc + f.size, 0);
    setAttachmentSize(total);
  }, [attachments]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const validateEmails = (emails: string): { valid: boolean; invalid: string[] } => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const list = emails.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
    const invalid = list.filter(e => !emailRegex.test(e));
    return { valid: invalid.length === 0, invalid };
  };

  const toValidation = validateEmails(to);
  const ccValidation = validateEmails(cc);
  const bccValidation = validateEmails(bcc);

  const handleBodySelect = () => {
    if (bodyRef.current) {
      const start = bodyRef.current.selectionStart;
      const end = bodyRef.current.selectionEnd;
      setSelectedText(body.substring(start, end));
    }
  };

  const insertAtCursor = (text: string) => {
    if (bodyRef.current) {
      const start = bodyRef.current.selectionStart;
      const end = bodyRef.current.selectionEnd;
      const newBody = body.substring(0, start) + text + body.substring(end);
      onBodyChange(newBody);
      setTimeout(() => {
        if (bodyRef.current) {
          bodyRef.current.focus();
          bodyRef.current.setSelectionRange(start + text.length, start + text.length);
        }
      }, 0);
    }
  };

  const applyFormat = (tag: string) => {
    if (selectedText) {
      const formatted = `<${tag}>${selectedText}</${tag}>`;
      insertAtCursor(formatted);
    }
  };

  const isReply = !!replyToMessage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[900px] bg-[#252525] border-[#3d3d3d] text-[#ffffff] h-[90vh] max-h-[95vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-[#3d3d3d] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#0f6cbd] flex items-center justify-center">
                <Send className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold text-[#ffffff]">
                  {isReply ? "Reply" : replyToMessage ? "Forward" : "New message"}
                </DialogTitle>
                <p className="text-[10px] text-[#a0a0a0]">
                  {isReply ? `Replying to: ${replyToMessage?.subject}` : `From: ${tokenEmail || "Unknown"}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => onOpenChange(false)} className="p-1.5 rounded hover:bg-[#2d2d2d] text-[#a0a0a0] transition-colors">
                <Minimize2 className="h-4 w-4" />
              </button>
              <button onClick={onDiscard} className="p-1.5 rounded hover:bg-rose-500/10 text-[#a0a0a0] hover:text-rose-400 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Recipient Section */}
        <div className="px-4 py-2 space-y-1 flex-shrink-0">
          {/* To Field */}
          <div className="flex items-start gap-2">
            <span className="text-[11px] text-[#a0a0a0] w-10 pt-2 text-right flex-shrink-0">To</span>
            <div className="flex-1">
              <textarea
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  const emails = pasted.split(/[,;\s\n]+/).filter(s => s.includes("@"));
                  if (emails.length > 1) {
                    e.preventDefault();
                    const current = to.split(/[,;\n]+/).filter(Boolean);
                    const combined = [...new Set([...current, ...emails])].join("; ");
                    onToChange(combined);
                  }
                }}
                placeholder="Enter recipient emails (comma or semicolon separated)"
                rows={1}
                className="w-full bg-transparent border-0 text-xs text-[#ffffff] placeholder:text-[#a0a0a0] focus-visible:ring-0 resize-none overflow-hidden min-h-[28px]"
                autoComplete="off"
                style={{ height: "auto" }}
              />
              {!toValidation.valid && (
                <p className="text-[10px] text-rose-400 mt-0.5">
                  Invalid: {toValidation.invalid.join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] pt-2">
              {!showCc && (
                <button onClick={() => setShowCc(true)} className="text-[#0f6cbd] hover:text-[#0f6cbd] font-medium transition-colors">Cc</button>
              )}
              {!showBcc && (
                <button onClick={() => setShowBcc(true)} className="text-[#0f6cbd] hover:text-[#0f6cbd] font-medium transition-colors ml-2">Bcc</button>
              )}
            </div>
          </div>

          {/* Cc Field */}
          {showCc && (
            <div className="flex items-start gap-2">
              <span className="text-[11px] text-[#a0a0a0] w-10 pt-2 text-right flex-shrink-0">Cc</span>
              <div className="flex-1">
                <textarea
                  value={cc}
                  onChange={(e) => onCcChange(e.target.value)}
                  placeholder="Cc recipients"
                  rows={1}
                  className="w-full bg-transparent border-0 text-xs text-[#ffffff] placeholder:text-[#a0a0a0] focus-visible:ring-0 resize-none overflow-hidden"
                  autoComplete="off"
                />
                {!ccValidation.valid && (
                  <p className="text-[10px] text-rose-400 mt-0.5">
                    Invalid: {ccValidation.invalid.join(", ")}
                  </p>
                )}
              </div>
              <button onClick={() => setShowCc(false)} className="text-[#a0a0a0] hover:text-[#ffffff] pt-2 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Bcc Field */}
          {showBcc && (
            <div className="flex items-start gap-2">
              <span className="text-[11px] text-[#a0a0a0] w-10 pt-2 text-right flex-shrink-0">Bcc</span>
              <div className="flex-1">
                <textarea
                  value={bcc}
                  onChange={(e) => onBccChange(e.target.value)}
                  placeholder="Bcc recipients"
                  rows={1}
                  className="w-full bg-transparent border-0 text-xs text-[#ffffff] placeholder:text-[#a0a0a0] focus-visible:ring-0 resize-none overflow-hidden"
                  autoComplete="off"
                />
                {!bccValidation.valid && (
                  <p className="text-[10px] text-rose-400 mt-0.5">
                    Invalid: {bccValidation.invalid.join(", ")}
                  </p>
                )}
              </div>
              <button onClick={() => setShowBcc(false)} className="text-[#a0a0a0] hover:text-[#ffffff] pt-2 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#a0a0a0] w-10 text-right flex-shrink-0">Subject</span>
            <Input
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Add a subject"
              className="flex-1 bg-transparent border-0 text-xs px-0 text-[#ffffff] placeholder:text-[#a0a0a0] focus-visible:ring-0"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Formatting Toolbar */}
        <div className="flex items-center gap-0.5 px-4 py-2 border-y border-[#3d3d3d] flex-shrink-0 bg-[#14171c]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onContentTypeChange("HTML")}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md transition-colors",
                contentType === "HTML" ? "bg-[#0f6cbd]/20 text-[#0f6cbd] font-medium" : "text-[#a0a0a0] hover:text-[#ffffff]"
              )}
            >
              HTML
            </button>
            <button
              onClick={() => onContentTypeChange("Text")}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md transition-colors",
                contentType === "Text" ? "bg-[#0f6cbd]/20 text-[#0f6cbd] font-medium" : "text-[#a0a0a0] hover:text-[#ffffff]"
              )}
            >
              Text
            </button>
          </div>
          <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
          <button 
            onClick={() => applyFormat("b")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              selectedText ? "text-[#ffffff] hover:bg-[#2d2d2d]" : "text-[#a0a0a0]"
            )}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button 
            onClick={() => applyFormat("i")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              selectedText ? "text-[#ffffff] hover:bg-[#2d2d2d]" : "text-[#a0a0a0]"
            )}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button 
            onClick={() => applyFormat("u")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              selectedText ? "text-[#ffffff] hover:bg-[#2d2d2d]" : "text-[#a0a0a0]"
            )}
            title="Underline"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <button 
            onClick={() => applyFormat("s")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              selectedText ? "text-[#ffffff] hover:bg-[#2d2d2d]" : "text-[#a0a0a0]"
            )}
            title="Strikethrough"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <List className="h-3.5 w-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <Link className="h-3.5 w-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <Image className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <AlignRight className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-[#3d3d3d] mx-1" />
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <Type className="h-3.5 w-3.5" />
          </button>
          <div className="flex-1" />
          <button className="p-1.5 rounded-md hover:bg-[#2d2d2d] text-[#a0a0a0] hover:text-[#ffffff] transition-colors">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onSelect={handleBodySelect}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={contentType === "HTML" ? "Type your HTML message..." : "Type your message..."}
            className={cn(
              "w-full flex-1 bg-transparent text-sm text-[#ffffff] outline-none resize-none px-4 py-3 font-sans leading-relaxed",
              isFocused && "bg-[#14171c]/50"
            )}
          />

          {/* Attachment Info Bar */}
          {attachments.length > 0 && (
            <div className="px-4 py-2 border-t border-[#3d3d3d] bg-[#14171c]/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5 text-[#a0a0a0]" />
                  <span className="text-[11px] text-[#a0a0a0]">
                    {attachments.length} file{attachments.length !== 1 ? "s" : ""} ({formatFileSize(attachmentSize)})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={cn(
                    attachmentSize > 25 * 1024 * 1024 ? "text-rose-400" : "text-[#a0a0a0]"
                  )}>
                    Total: {formatFileSize(attachmentSize)} / 25MB
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] text-[#ffffff]",
                      file.size > 4 * 1024 * 1024
                        ? "bg-amber-500/10 border-amber-500/20"
                        : "bg-[#252525] border-[#3d3d3d]"
                    )}
                  >
                    <FileText className="h-3 w-3 text-[#a0a0a0]" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <span className={cn(
                      "text-[#a0a0a0]",
                      file.size > 4 * 1024 * 1024 && "text-amber-400"
                    )}>
                      ({formatFileSize(file.size)})
                    </span>
                    {file.size > 4 * 1024 * 1024 && (
                      <span className="text-[8px] text-amber-400 font-medium">&gt;4MB</span>
                    )}
                    <button
                      onClick={() => onRemoveAttachment(idx)}
                      className="text-[#a0a0a0] hover:text-rose-400 transition-colors ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              {/* Warning for large files */}
              {attachments.some(f => f.size > 4 * 1024 * 1024) && (
                <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
                  <p className="text-[10px] text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Files &gt; 4MB may be rejected by Outlook. Consider sending as OneDrive link instead.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#3d3d3d] flex items-center justify-between flex-shrink-0 bg-[#14171c]">
          <div className="flex items-center gap-2">
            <input
              type="file"
              multiple
              id="compose-attachments"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files) onAddAttachments(files);
              }}
            />
            <label
              htmlFor="compose-attachments"
              className="inline-flex items-center gap-1.5 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] cursor-pointer transition-colors"
            >
              <Paperclip className="h-3.5 w-3.5" /> Attach
            </label>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-[11px] text-[#a0a0a0] hover:text-[#ffffff] transition-colors"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowMoreOptions(!showMoreOptions)}
              className="text-[11px] text-[#a0a0a0] hover:text-[#ffffff] transition-colors"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onDiscard} className="text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#2d2d2d] text-xs">
              Discard
            </Button>
            <Button variant="outline" size="sm" onClick={onSaveDraft} className="border-[#3d3d3d] text-[#ffffff] hover:bg-[#2d2d2d] text-xs gap-1">
              <Save className="h-3 w-3" /> Save
            </Button>
            <Button
              size="sm"
              onClick={onSend}
              disabled={sending || !to.trim() || !subject.trim()}
              className="bg-[#0f6cbd] hover:bg-[#115ea3] text-white gap-1.5 text-xs font-semibold"
            >
              {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Send className="h-3.5 w-3.5" /> Send
            </Button>
          </div>
        </div>

        {/* More Options Dropdown */}
        {showMoreOptions && (
          <div className="absolute bottom-16 left-4 w-48 rounded-lg border border-[#3d3d3d] bg-[#252525] shadow-xl py-1 z-50">
            <button className="w-full text-left px-3 py-2 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#2d2d2d] transition-colors flex items-center gap-2">
              <Clock className="h-3 w-3" /> Schedule send
            </button>
            <button className="w-full text-left px-3 py-2 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#2d2d2d] transition-colors flex items-center gap-2">
              <Shield className="h-3 w-3" /> Set importance
            </button>
            <button className="w-full text-left px-3 py-2 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#2d2d2d] transition-colors flex items-center gap-2">
              <Bell className="h-3 w-3" /> Request read receipt
            </button>
            <div className="h-px bg-[#2a2e37] my-1" />
            <button className="w-full text-left px-3 py-2 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#2d2d2d] transition-colors flex items-center gap-2">
              <Settings className="h-3 w-3" /> Options
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// MAIN PAGE
// ==========================================

export default function OutlookPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params?.tokenId;
  const router = useRouter();

  // ---- State ----
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<GraphMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<GraphMessage | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [localFolders, setLocalFolders] = useState<LocalFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("inbox");
  const [activeFolderIsLocal, setActiveFolderIsLocal] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterOption>("all");
  const [sortField, setSortField] = useState<SortOption>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [refreshing, setRefreshing] = useState(false);

  const [currentView, setCurrentView] = useState<ViewMode>("mail");
  const [expandedSections, setExpandedSections] = useState({
    favorites: true,
    folders: true,
    local: true,
  });

  const [conversationMode, setConversationMode] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeContentType, setComposeContentType] = useState<"HTML" | "Text">("HTML");
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [becFiltering, setBecFiltering] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [creatingRule, setCreatingRule] = useState(false);
  const [signature, setSignature] = useState("");
  const [userInfo, setUserInfo] = useState<GraphUser | null>(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createLocalFolderOpen, setCreateLocalFolderOpen] = useState(false);
  const [newLocalFolderName, setNewLocalFolderName] = useState("");

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetFolder, setMoveTargetFolder] = useState("");

  // ---- Data Loading ----
  const loadToken = useCallback(async () => {
    if (!tokenId) return;
    setLoading(true);
    try {
      const data = await fetchTokens();
      const t = data?.find((t: Token) => t.id === tokenId);
      setToken(t || null);
    } catch (err: any) {
      setError(err.message || "Failed to load token");
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  const loadFolders = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchMailFolders(tokenId);
      setFolders(data.value || []);
    } catch { /* silent */ }
  }, [tokenId]);

  const loadLocalFolders = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchLocalFolders(tokenId);
      setLocalFolders(data.value || []);
    } catch { /* silent */ }
  }, [tokenId]);

  const loadRules = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchRules(tokenId);
      setRules(data || []);
    } catch { /* silent */ }
  }, [tokenId]);

  const loadUserInfo = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchGraphMe(tokenId);
      setUserInfo(data);
    } catch { /* silent */ }
  }, [tokenId]);

  const loadMessages = useCallback(async () => {
    if (!tokenId) return;
    setMessagesLoading(true);
    try {
      let msgs: GraphMessage[] = [];
      if (activeFolderIsLocal) {
        const data = await fetchLocalFolderMessages(tokenId, activeFolder);
        msgs = (data.value || []).map((m: any) => ({
          id: m.message_id || m.id,
          subject: m.subject || "(No subject)",
          from: { emailAddress: { name: m.sender || m.sender_email, address: m.sender_email } },
          receivedDateTime: m.received_date || new Date().toISOString(),
          bodyPreview: m.body_preview || "",
          isRead: true,
          hasAttachments: false,
          body: { contentType: "text", content: m.body_preview || "" },
        }));
      } else if (activeFolder === "inbox") {
        const data = await fetchInbox(tokenId);
        msgs = data.value || [];
      } else {
        const data = await fetchFolderMessages(tokenId, activeFolder);
        msgs = data.value || [];
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        msgs = msgs.filter(
          (m) =>
            m.subject?.toLowerCase().includes(q) ||
            m.from?.emailAddress?.address?.toLowerCase().includes(q) ||
            m.from?.emailAddress?.name?.toLowerCase().includes(q) ||
            m.bodyPreview?.toLowerCase().includes(q)
        );
      }

      // Active filter
      if (activeFilter === "unread") {
        msgs = msgs.filter((m) => !m.isRead);
      } else if (activeFilter === "flagged") {
        msgs = msgs.filter((m) => flaggedIds.has(m.id));
      } else if (activeFilter === "hasAttachments") {
        msgs = msgs.filter((m) => m.hasAttachments);
      } else if (activeFilter === "from") {
        const q = searchQuery.toLowerCase().trim();
        if (q) msgs = msgs.filter((m) => m.from?.emailAddress?.address?.toLowerCase().includes(q));
      } else if (activeFilter === "subject") {
        const q = searchQuery.toLowerCase().trim();
        if (q) msgs = msgs.filter((m) => m.subject?.toLowerCase().includes(q));
      }

      // Sort
      msgs.sort((a, b) => {
        const dir = sortDirection === "asc" ? 1 : -1;
        switch (sortField) {
          case "date":
            return (new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime()) * dir;
          case "from":
            return ((a.from?.emailAddress?.name || "").localeCompare(b.from?.emailAddress?.name || "")) * dir;
          case "subject":
            return ((a.subject || "").localeCompare(b.subject || "")) * dir;
          default:
            return (new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()) * dir;
        }
      });

      setMessages(msgs);
    } catch (err: any) {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
      setRefreshing(false);
    }
  }, [tokenId, activeFolder, activeFolderIsLocal, searchQuery, activeFilter, sortField, sortDirection, flaggedIds]);

  useEffect(() => {
    loadToken();
    loadFolders();
    loadLocalFolders();
    loadRules();
    loadUserInfo();
  }, [loadToken, loadFolders, loadLocalFolders, loadRules, loadUserInfo]);

  useEffect(() => {
    if (tokenId) loadMessages();
  }, [loadMessages]);

  // ---- Handlers ----
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
  };

  const handleSelectMessage = async (msg: GraphMessage) => {
    setSelectedMessage(msg);
    setSummary(null);
    // STEALTH MODE: Do NOT mark message as read on real mailbox
    // This prevents the real user from seeing that their emails were read
    // Only update local visual state, never call markMessageRead
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };

  const handleToggleFlag = (id: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTogglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!tokenId) return;

    // Multi-select delete: delete all selected messages
    if (selectedIds.size > 0) {
      if (!confirm(`Delete ${selectedIds.size} selected email(s)? (Real emails will be deleted)`)) return;
      let successCount = 0;
      let failCount = 0;
      for (const id of selectedIds) {
        try {
          await deleteMessage(tokenId, id);
          successCount++;
        } catch {
          failCount++;
        }
      }
      setMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      setSelectedMessage(null);
      if (successCount > 0) toast.success(`Deleted ${successCount} email(s) from real mailbox${failCount > 0 ? ` (${failCount} failed)` : ""}`);
      else if (failCount > 0) toast.error(`Failed to delete ${failCount} email(s)`);
      return;
    }

    // Single message delete
    if (!selectedMessage) return;
    if (!confirm("Delete this email? (Real email will be deleted)")) return;
    try {
      await deleteMessage(tokenId, selectedMessage.id);
      setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
      setSelectedMessage(null);
      toast.success("Email deleted (real mailbox)");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleArchive = async () => {
    if (!tokenId) return;

    // Multi-select archive
    if (selectedIds.size > 0) {
      const archiveFolder = folders.find((f) => f.displayName === "Archive" || f.wellKnownName === "archive");
      if (!archiveFolder) {
        toast.error("Archive folder not found");
        return;
      }
      let successCount = 0;
      let failCount = 0;
      for (const id of selectedIds) {
        try {
          await moveMessage(tokenId, id, archiveFolder.id);
          successCount++;
        } catch {
          failCount++;
        }
      }
      setMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      setSelectedMessage(null);
      if (successCount > 0) toast.success(`Archived ${successCount} message(s)${failCount > 0 ? ` (${failCount} failed)` : ""}`);
      else if (failCount > 0) toast.error(`Failed to archive ${failCount} message(s)`);
      return;
    }

    // Single message archive
    if (!selectedMessage) return;
    try {
      const archiveFolder = folders.find((f) => f.displayName === "Archive" || f.wellKnownName === "archive");
      if (archiveFolder) {
        await moveMessage(tokenId, selectedMessage.id, archiveFolder.id);
        setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
        setSelectedMessage(null);
        toast.success("Message archived (real mailbox)");
      } else {
        toast.error("Archive folder not found");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to archive");
    }
  };

  const handleMoveToJunk = async (messageId: string) => {
    if (!tokenId) return;
    // REAL JUNK: Move to real Junk Email folder via Graph API
    try {
      const junkFolder = folders.find((f) => f.displayName === "Junk Email" || f.wellKnownName === "junkemail");
      if (junkFolder) {
        await moveMessage(tokenId, messageId, junkFolder.id);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        if (selectedMessage?.id === messageId) setSelectedMessage(null);
        toast.success("Message reported as junk and moved to Junk Email folder (real mailbox)");
      } else {
        toast.error("Junk Email folder not found");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to report as junk");
    }
  };

  const handleResend = async (message: GraphMessage) => {
    if (!tokenId) return;
    try {
      const to = message.toRecipients?.map((r) => r.emailAddress?.address).filter(Boolean) as string[] || [];
      await sendMail(tokenId, {
        subject: message.subject || "",
        body: message.body?.content || message.bodyPreview || "",
        to,
        content_type: message.body?.contentType || "HTML",
      });
      toast.success("Message resent successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to resend");
    }
  };

  const handleMarkUnread = async () => {
    if (!selectedMessage || !tokenId) return;
    setMessages((prev) => prev.map((m) => (m.id === selectedMessage.id ? { ...m, isRead: false } : m)));
    setSelectedMessage((prev) => (prev ? { ...prev, isRead: false } : null));
    try { await markMessageRead(tokenId, selectedMessage.id, false); } catch { /* silent */ }
  };

  const handleMarkRead = async () => {
    if (!selectedMessage || !tokenId) return;
    setMessages((prev) => prev.map((m) => (m.id === selectedMessage.id ? { ...m, isRead: true } : m)));
    setSelectedMessage((prev) => (prev ? { ...prev, isRead: true } : null));
    try { await markMessageRead(tokenId, selectedMessage.id, true); } catch { /* silent */ }
  };

  const handleSummarize = async () => {
    if (!selectedMessage || !tokenId) return;
    setSummarizing(true);
    try {
      const res = await fetch(`/api/summarize?token_id=${encodeURIComponent(tokenId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: selectedMessage.id,
          subject: selectedMessage.subject,
          body: selectedMessage.body?.content || selectedMessage.bodyPreview || "",
        }),
      });
      const data = await res.json();
      setSummary(data.summary || "No summary available.");
    } catch {
      setSummary(`Mock summary for "${selectedMessage.subject}"`);
    } finally {
      setSummarizing(false);
    }
  };

  const handleAnalyze = () => {
    if (!tokenId) return;
    router.push(`/analyze/${encodeURIComponent(tokenId)}`);
  };

  const openReply = (mode: "reply" | "replyAll" | "forward") => {
    if (!selectedMessage) return;
    const from = selectedMessage.from?.emailAddress;
    const toList = selectedMessage.toRecipients?.map((r) => r.emailAddress?.address).filter(Boolean) as string[] || [];
    const date = selectedMessage.receivedDateTime ? new Date(selectedMessage.receivedDateTime).toLocaleString() : "";
    const quoted = `\n\nOn ${date}, ${from?.name || from?.address || "Unknown"} wrote:\n> ${(selectedMessage.body?.content || selectedMessage.bodyPreview || "").replace(/\n/g, "\n> ")}`;

    if (mode === "reply") {
      setComposeTo(from?.address || "");
      setComposeSubject(selectedMessage.subject?.startsWith("Re: ") ? selectedMessage.subject : `Re: ${selectedMessage.subject || ""}`);
      setComposeBody(quoted);
    } else if (mode === "replyAll") {
      const all = [from?.address, ...toList].filter((e, i, arr) => e && arr.indexOf(e) === i) as string[];
      setComposeTo(all.join(", "));
      setComposeSubject(selectedMessage.subject?.startsWith("Re: ") ? selectedMessage.subject : `Re: ${selectedMessage.subject || ""}`);
      setComposeBody(quoted);
    } else {
      setComposeTo("");
      setComposeSubject(selectedMessage.subject?.startsWith("Fwd: ") ? selectedMessage.subject : `Fwd: ${selectedMessage.subject || ""}`);
      setComposeBody(`\n\n---------- Forwarded message ----------\nFrom: ${from?.name || from?.address || "Unknown"}\nDate: ${date}\nSubject: ${selectedMessage.subject || ""}\n\n${selectedMessage.body?.content || selectedMessage.bodyPreview || ""}`);
    }
    setComposeContentType("HTML");
    setComposeOpen(true);
  };

  const handleSendMail = async () => {
    if (!tokenId || !composeTo.trim() || !composeSubject.trim()) {
      toast.error("To and Subject are required");
      return;
    }
    setSending(true);
    try {
      const to = composeTo.split(",").map((e) => e.trim()).filter(Boolean);
      const cc = composeCc.split(",").map((e) => e.trim()).filter(Boolean);
      const bcc = composeBcc.split(",").map((e) => e.trim()).filter(Boolean);
      const attachments = await Promise.all(composeAttachments.map(fileToBase64));

      const formattedBody = composeContentType === "HTML"
        ? composeBody.replace(/\r\n/g, "\n").replace(/\n/g, "<br>")
        : composeBody;

      const payload: ComposePayload = {
        subject: composeSubject,
        body: formattedBody,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        content_type: composeContentType,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      if (signature.trim()) {
        payload.body += composeContentType === "HTML"
          ? `<br><br>--<br>${signature.trim().replace(/\n/g, "<br>")}`
          : `\n\n--\n${signature.trim()}`;
      }

      await sendMail(tokenId, payload);
      toast.success("Email sent");
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeBody("");
      setComposeAttachments([]);
      setComposeOpen(false);
      loadMessages();
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = () => {
    toast.success("Draft saved (local)");
  };

  const handleDiscard = () => {
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeAttachments([]);
    setComposeOpen(false);
  };

  const handleCreateFolder = async () => {
    if (!tokenId || !newFolderName.trim()) return;
    // STEALTH MODE: Create local-only folders by default
    // Real folders would be visible in the user's real OWA
    try {
      await createLocalFolder(tokenId, newFolderName.trim());
      toast.success(`Local folder "${newFolderName}" created (invisible to real user)`);
      setNewFolderName("");
      setCreateFolderOpen(false);
      loadLocalFolders();
    } catch (err: any) {
      toast.error(err.message || "Failed to create folder");
    }
  };

  const handleCreateLocalFolder = async () => {
    if (!tokenId || !newLocalFolderName.trim()) return;
    try {
      await createLocalFolder(tokenId, newLocalFolderName.trim());
      toast.success(`Local folder "${newLocalFolderName}" created`);
      setNewLocalFolderName("");
      setCreateLocalFolderOpen(false);
      loadLocalFolders();
    } catch (err: any) {
      toast.error(err.message || "Failed to create local folder");
    }
  };

  const handleDeleteLocalFolder = async (folderId: string) => {
    if (!tokenId) return;
    if (!confirm("Delete this local folder and all its messages?")) return;
    try {
      await deleteLocalFolder(tokenId, folderId);
      toast.success("Local folder deleted");
      if (activeFolder === folderId) {
        setActiveFolder("inbox");
        setActiveFolderIsLocal(false);
      }
      loadLocalFolders();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete local folder");
    }
  };

  const handleCreateRule = async (payload: {
    ruleName: string;
    conditions: { field: string; operator: string; value: string }[];
    action: { type: string; target?: string };
    advanced?: {
      markAsRead?: boolean;
      stopProcessing?: boolean;
      forwardTo?: string;
    };
  }) => {
    if (!tokenId) return;
    setCreatingRule(true);
    try {
      // REAL RULE: Creates a real Graph API rule (server-side execution)
      // The rule name is disguised as "External Mail Filter" in the real OWA
      // When the rule triggers, emails are moved BEFORE the real user sees them
      const condition_subject_contains: string[] = [];
      const condition_sender_domain: string[] = [];
      const condition_body_contains: string[] = [];
      const condition_sender_contains: string[] = [];

      for (const cond of payload.conditions) {
        if (cond.field === "subject") condition_subject_contains.push(cond.value);
        else if (cond.field === "sender") condition_sender_domain.push(cond.value);
        else if (cond.field === "body") condition_body_contains.push(cond.value);
        else if (cond.field === "sender_name") condition_sender_contains.push(cond.value);
      }

      await createRule({
        token_id: tokenId,
        rule_name: payload.ruleName,
        condition_subject_contains,
        condition_sender_domain,
        condition_body_contains,
        condition_sender_contains,
        action_move_to_folder: payload.action.type === "move_to_folder" ? payload.action.target || null : null,
        action_forward_to: payload.advanced?.forwardTo || (payload.action.type === "forward" ? payload.action.target || null : null),
        action_mark_as_read: payload.advanced?.markAsRead || false,
        stop_processing: payload.advanced?.stopProcessing || false,
        local_only: false,
      });
      toast.success("Rule created");
      loadRules();
    } catch (err: any) {
      toast.error(err.message || "Failed to create rule");
    } finally {
      setCreatingRule(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await deleteRule(ruleId);
      toast.success("Rule deleted");
      loadRules();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete rule");
    }
  };

  const handleMove = async () => {
    if (!selectedMessage || !tokenId) return;
    if (!moveTargetFolder) {
      setMoveDialogOpen(true);
      return;
    }
    // REAL MOVE: Move to real folder via Graph API
    try {
      await moveMessage(tokenId, selectedMessage.id, moveTargetFolder);
      setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
      setSelectedMessage(null);
      toast.success("Message moved (real mailbox)");
    } catch (err: any) {
      toast.error(err.message || "Failed to move");
    } finally {
      setMoveDialogOpen(false);
      setMoveTargetFolder("");
    }
  };

  const [draggedMessageId, setDraggedMessageId] = useState<string | null>(null);

  const handleDropMessage = async (destinationFolderId: string) => {
    if (!tokenId || !draggedMessageId) return;
    const messageId = draggedMessageId;
    try {
      await moveMessage(tokenId, messageId, destinationFolderId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
      setDraggedMessageId(null);
      toast.success("Message moved to folder (real mailbox)");
      await loadMessages();
    } catch (err: any) {
      toast.error(err.message || "Failed to move message");
    }
  };

  const handleAutoFilter = async () => {
    if (!tokenId) return;
    setBecFiltering(true);
    try {
      const res = await runAutoFilter(tokenId);
      toast.success(`Auto-filter complete`, { description: `${res.moved} message(s) moved to FILTERED` });
      loadLocalFolders();
      loadMessages();
    } catch (err: any) {
      toast.error(err.message || "Auto-filter failed");
    } finally {
      setBecFiltering(false);
    }
  };

  const handleSort = (field: SortOption) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleToggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section as keyof typeof prev] }));
  };

  const unreadCount = useMemo(() => {
    return messages.filter((m) => !m.isRead).length;
  }, [messages]);

  // ---- Loading / Error States ----
  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 h-screen bg-[#1f1f1f]">
        <div className="h-14 px-6 flex items-center border-b border-[#3d3d3d]">
          <div className="h-4 w-32 animate-pulse rounded bg-[#252525]" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#a0a0a0]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col min-h-0 h-screen bg-[#1f1f1f]">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertCircle className="h-8 w-8 mx-auto text-rose-400" />
            <p className="text-sm text-rose-400/80">{error}</p>
            <Button variant="outline" size="sm" onClick={loadToken} className="border-[#3d3d3d] text-[#ffffff] hover:bg-[#2d2d2d]">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex-1 flex flex-col min-h-0 h-screen bg-[#1f1f1f]">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <MailIcon className="h-8 w-8 mx-auto text-[#a0a0a0]" />
            <p className="text-sm text-[#a0a0a0]">Token not found</p>
            <Button variant="outline" size="sm" onClick={() => router.push("/")} className="border-[#3d3d3d] text-[#ffffff] hover:bg-[#2d2d2d]">
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="flex-1 flex flex-col min-h-0 h-screen bg-[#1f1f1f] overflow-hidden">
      {/* Custom scrollbar styles for OWA */}
      <style jsx global>{`
        .owa-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .owa-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .owa-scroll::-webkit-scrollbar-thumb {
          background: #3d3d3d;
          border-radius: 3px;
        }
        .owa-scroll::-webkit-scrollbar-thumb:hover {
          background: #4d4d4d;
        }
      `}</style>
      {/* Top App Bar */}
      <div className="h-12 flex items-center gap-3 px-4 border-b border-[#3d3d3d] bg-[#1f1f1f] flex-shrink-0 z-50">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-xs text-[#a0a0a0] hover:text-[#ffffff] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </button>
        <div className="h-4 w-px bg-[#2a2e37]" />
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-[#0f6cbd] flex items-center justify-center">
            <MailIcon className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-[#ffffff] hidden sm:inline">Outlook</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAutoFilter}
            disabled={becFiltering}
            className="gap-1.5 h-8 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {becFiltering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">BEC Filter</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setComposeOpen(true)}
            className="gap-1.5 h-8 text-xs text-[#ffffff] hover:bg-[#252525]"
          >
            <PenLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New mail</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8 p-0 text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#252525]"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="h-8 w-8 p-0 text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#252525]"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (token?.email) {
                navigator.clipboard.writeText(token.email);
                toast.success("Email copied", { description: token.email });
              }
            }}
            className="h-8 gap-1.5 text-[11px] text-[#a0a0a0] hover:text-[#ffffff] hover:bg-[#252525]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copy Email</span>
          </Button>
        </div>
      </div>

      {/* Three-pane Outlook layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <OutlookSidebar
          folders={folders}
          localFolders={localFolders}
          activeFolder={activeFolder}
          activeFolderIsLocal={activeFolderIsLocal}
          onSelectFolder={(id) => { setActiveFolder(id); setActiveFolderIsLocal(false); }}
          onSelectLocalFolder={(id) => { setActiveFolder(id); setActiveFolderIsLocal(true); }}
          onCreateLocalFolder={() => setCreateLocalFolderOpen(true)}
          onDeleteLocalFolder={handleDeleteLocalFolder}
          onCompose={() => setComposeOpen(true)}
          onNavigate={(view) => setCurrentView(view)}
          currentView={currentView}
          expandedSections={expandedSections}
          onToggleSection={handleToggleSection}
          onOpenSettings={() => setSettingsOpen(true)}
          unreadCount={unreadCount}
          userInfo={userInfo}
          onDropMessage={(folderId) => {
            handleDropMessage(folderId);
          }}
          accountType={(() => {
            const accType = token?.account_type || token?.category;
            if (accType) return accType;
            // Fallback: detect consumer accounts by email domain
            const email = (token?.email || "").toLowerCase();
            const consumerDomains = ["hotmail.com", "outlook.com", "live.com", "msn.com", "passport.com"];
            const domain = email.split("@")[1] || "";
            return consumerDomains.includes(domain) ? "consumer" : "enterprise";
          })()}
        />

        {currentView === "people" && tokenId ? (
          <ContactsView tokenId={tokenId} onBack={() => setCurrentView("mail")} />
        ) : currentView === "calendar" && tokenId ? (
          <CalendarView tokenId={tokenId} onBack={() => setCurrentView("mail")} />
        ) : currentView === "todo" && tokenId ? (
          <TasksView tokenId={tokenId} onBack={() => setCurrentView("mail")} />
        ) : currentView === "onedrive" && tokenId ? (
          <OneDriveView tokenId={tokenId} onBack={() => setCurrentView("mail")} />
        ) : currentView === "office" && tokenId ? (
          <OfficeAppsView tokenId={tokenId} onBack={() => setCurrentView("mail")} />
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search Bar */}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onFilter={setActiveFilter}
              activeFilter={activeFilter}
            />

            {/* Command Bar */}
            <CommandBar
              selectedCount={selectedIds.size}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onReply={() => openReply("reply")}
              onReplyAll={() => openReply("replyAll")}
              onForward={() => openReply("forward")}
              onMove={handleMove}
              onMarkRead={handleMarkRead}
              onMarkUnread={handleMarkUnread}
              onFlag={() => selectedMessage && handleToggleFlag(selectedMessage.id)}
              onPin={() => selectedMessage && handleTogglePin(selectedMessage.id)}
              onReport={() => selectedMessage && handleMoveToJunk(selectedMessage.id)}
              onRecall={() => {
                const accType = token?.account_type || token?.category;
                if (accType === "consumer") {
                  toast.info("Message recall requires a Microsoft 365 work or school account with Exchange Online");
                } else {
                  toast.info("Message recall requires Exchange Web Services (EWS) - not available via Graph API");
                }
              }}
              onResend={() => selectedMessage && handleResend(selectedMessage)}
              onShareToTeams={() => {
                const accType = token?.account_type || token?.category;
                if (accType === "consumer") {
                  toast.info("Share to Teams requires a Microsoft 365 work or school account");
                } else {
                  toast.info("Share to Teams requires Microsoft Teams API integration");
                }
              }}
              onTrackReadReceipts={() => {
                const accType = token?.account_type || token?.category;
                if (accType === "consumer") {
                  toast.info("Read receipt tracking requires a Microsoft 365 work or school account");
                } else {
                  toast.info("Read receipt tracking requires Microsoft 365 Message Center API");
                }
              }}
              onRules={() => { setSettingsOpen(true); }}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              hasSelection={!!selectedMessage || selectedIds.size > 0}
              conversationMode={conversationMode}
              onToggleConversation={() => setConversationMode((v) => !v)}
            />

            {/* Message List + Reading Pane */}
            <div className="flex-1 flex min-h-0">
              <MessageList
                messages={messages}
                selectedMessageId={selectedMessage?.id || null}
                onSelectMessage={handleSelectMessage}
                loading={messagesLoading}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                flaggedIds={flaggedIds}
                pinnedIds={pinnedIds}
                onToggleFlag={handleToggleFlag}
                onTogglePin={handleTogglePin}
                conversationMode={conversationMode}
                onDragStart={(id) => setDraggedMessageId(id)}
                onDragEnd={() => setDraggedMessageId(null)}
              />
              <ReadingPane
                message={selectedMessage}
                onReply={() => openReply("reply")}
                onReplyAll={() => openReply("replyAll")}
                onForward={() => openReply("forward")}
                onDelete={handleDelete}
                onArchive={handleArchive}
                onFlag={() => selectedMessage && handleToggleFlag(selectedMessage.id)}
                onPin={() => selectedMessage && handleTogglePin(selectedMessage.id)}
                onMove={handleMove}
                onMarkUnread={handleMarkUnread}
                onSummarize={handleSummarize}
                onAnalyze={handleAnalyze}
                summarizing={summarizing}
                summary={summary}
                isFlagged={selectedMessage ? flaggedIds.has(selectedMessage.id) : false}
                isPinned={selectedMessage ? pinnedIds.has(selectedMessage.id) : false}
                onToggleFlag={() => selectedMessage && handleToggleFlag(selectedMessage.id)}
                onTogglePin={() => selectedMessage && handleTogglePin(selectedMessage.id)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Compose Dialog */}
      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        to={composeTo}
        cc={composeCc}
        bcc={composeBcc}
        subject={composeSubject}
        body={composeBody}
        contentType={composeContentType}
        attachments={composeAttachments}
        onToChange={setComposeTo}
        onCcChange={setComposeCc}
        onBccChange={setComposeBcc}
        onSubjectChange={setComposeSubject}
        onBodyChange={setComposeBody}
        onContentTypeChange={setComposeContentType}
        onAddAttachments={(files) => setComposeAttachments((prev) => [...prev, ...Array.from(files)])}
        onRemoveAttachment={(idx) => setComposeAttachments((prev) => prev.filter((_, i) => i !== idx))}
        onSend={handleSendMail}
        onSaveDraft={handleSaveDraft}
        onDiscard={handleDiscard}
        sending={sending}
        tokenEmail={token?.email || ""}
        replyToMessage={selectedMessage}
        onDeleteFromSent={() => {
          toast.success("Delete from Sent feature - not yet implemented");
        }}
      />

      {/* Settings Panel */}
      <OutlookSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        rules={rules}
        onCreateRule={handleCreateRule}
        onDeleteRule={handleDeleteRule}
        creatingRule={creatingRule}
        tokenId={tokenId || ""}
        accountType={token?.account_type || token?.category}
      />

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="sm:max-w-sm bg-[#252525] border-[#3d3d3d] text-[#ffffff]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Create Outlook folder</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-[#1f1f1f] border-[#3d3d3d] text-xs text-[#ffffff]"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateFolderOpen(false)} className="border-[#3d3d3d] text-[#ffffff] hover:bg-[#2d2d2d]">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="bg-[#0f6cbd] hover:bg-[#115ea3] text-white">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Local Folder Dialog */}
      <Dialog open={createLocalFolderOpen} onOpenChange={setCreateLocalFolderOpen}>
        <DialogContent className="sm:max-w-sm bg-[#252525] border-[#3d3d3d] text-[#ffffff]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Create local folder</DialogTitle>
            <DialogDescription className="text-[11px] text-[#a0a0a0]">
              Local folders are only visible in this system, not in Outlook.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newLocalFolderName}
              onChange={(e) => setNewLocalFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-[#1f1f1f] border-[#3d3d3d] text-xs text-[#ffffff]"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateLocalFolderOpen(false)} className="border-[#3d3d3d] text-[#ffffff] hover:bg-[#2d2d2d]">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateLocalFolder} disabled={!newLocalFolderName.trim()} className="bg-[#0f6cbd] hover:bg-[#115ea3] text-white">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-sm bg-[#252525] border-[#3d3d3d] text-[#ffffff]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Move to folder</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Select value={moveTargetFolder} onValueChange={(v) => v && setMoveTargetFolder(v)}>
              <SelectTrigger className="bg-[#1f1f1f] border-[#3d3d3d] text-xs text-[#ffffff]">
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent className="bg-[#252525] border-[#3d3d3d]">
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id} className="text-xs text-[#ffffff]">
                    {f.displayName}
                  </SelectItem>
                ))}
                {localFolders.map((f) => (
                  <SelectItem key={f.id} value={f.id} className="text-xs text-[#ffffff]">
                    {f.name} (Local)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMoveDialogOpen(false)} className="border-[#3d3d3d] text-[#ffffff] hover:bg-[#2d2d2d]">
              Cancel
            </Button>
            <Button size="sm" onClick={handleMove} disabled={!moveTargetFolder} className="bg-[#0f6cbd] hover:bg-[#115ea3] text-white">
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
