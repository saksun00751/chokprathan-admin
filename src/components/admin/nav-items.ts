/** Back-office menu data. Plain module so the server can read it to filter by permission. */
import {
  Ban,
  Banknote,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Gamepad2,
  Gauge,
  ArrowLeftRight,
  Flame,
  Share2,
  Gift,
  History,
  Images,
  Landmark,
  Megaphone,
  LayoutDashboard,
  Newspaper,
  Package,
  Palette,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/domain/permissions";

type ItemKey =
  | "dashboard"
  | "reports"
  | "rounds"
  | "results"
  | "resultHistory"
  | "bills"
  | "risk"
  | "lottos"
  | "packages"
  | "games"
  | "members"
  | "blocklist"
  | "finance"
  | "transactions"
  | "exposure"
  | "referrals"
  | "banks"
  | "promotions"
  | "activities"
  | "banners"
  | "news"
  | "theme"
  | "settings"
  | "staff"
  | "audit"
  | "whatsNew"
  | "security";
/** `also`: other permissions that each open the item on their own. */
export type Item = { href: string; key: ItemKey; icon: LucideIcon; need: Permission | null; also?: Permission[]; badge?: "finance" | "results" };

/** The back-office menu; labels come from the admin dictionary. `need: null` items are open to every staff member. */
export const NAV_GROUPS: { key: "overview" | "finance" | "lotto" | "lottoSettings" | "games" | "members" | "marketing" | "system"; items: Item[] }[] = [
  {
    key: "overview",
    items: [
      { href: "/", key: "dashboard", icon: LayoutDashboard, need: "dashboard.view" },
      { href: "/reports", key: "reports", icon: BarChart3, need: "reports.view" },
    ],
  },
  {
    key: "finance",
    items: [
      { href: "/finance", key: "finance", icon: Banknote, need: "finance.view", badge: "finance" },
      { href: "/banks", key: "banks", icon: Landmark, need: "banks.view" },
      { href: "/transactions", key: "transactions", icon: ArrowLeftRight, need: "finance.view" },
    ],
  },
  {
    key: "lotto",
    items: [
      { href: "/rounds", key: "rounds", icon: CalendarClock, need: "rounds.view" },
      { href: "/results", key: "results", icon: ClipboardCheck, need: "rounds.result", badge: "results" },
      { href: "/result-history", key: "resultHistory", icon: History, need: "rounds.view" },
      // Names and phone numbers: the same permission as the member pages.
      { href: "/bills", key: "bills", icon: ReceiptText, need: "members.view" },
      { href: "/exposure", key: "exposure", icon: Flame, need: "risk.manage" },
    ],
  },
  {
    key: "lottoSettings",
    items: [
      { href: "/risk", key: "risk", icon: Gauge, need: "risk.manage" },
      { href: "/lottos", key: "lottos", icon: Ticket, need: "lottos.manage" },
      { href: "/packages", key: "packages", icon: Package, need: "lottos.manage" },
    ],
  },
  {
    key: "games",
    items: [{ href: "/games", key: "games", icon: Gamepad2, need: "games.manage" }],
  },
  {
    key: "members",
    items: [
      { href: "/members", key: "members", icon: Users, need: "members.view" },
      { href: "/blocklist", key: "blocklist", icon: Ban, need: "members.block" },
      { href: "/referrals", key: "referrals", icon: Share2, need: "members.view" },
    ],
  },
  {
    key: "marketing",
    items: [
      { href: "/promotions", key: "promotions", icon: Gift, need: "promotions.manage" },
      { href: "/activities", key: "activities", icon: Sparkles, need: "promotions.manage" },
      { href: "/banners", key: "banners", icon: Images, need: "content.manage" },
      { href: "/news", key: "news", icon: Newspaper, need: "content.manage" },
    ],
  },
  {
    key: "system",
    items: [
      { href: "/theme", key: "theme", icon: Palette, need: "theme.manage" },
      { href: "/settings", key: "settings", icon: Settings, need: "settings.manage" },
      { href: "/staff", key: "staff", icon: UserCog, need: "staff.manage" },
      { href: "/audit", key: "audit", icon: ScrollText, need: "audit.view" },
      { href: "/whats-new", key: "whatsNew", icon: Megaphone, need: null },
      { href: "/security", key: "security", icon: ShieldCheck, need: null },
    ],
  },
];
