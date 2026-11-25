/** Back-office menu data. Plain module so the server can read it to filter by permission. */
import {
  Ban,
  Banknote,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Gamepad2,
  Gauge,
  Gift,
  Images,
  Landmark,
  LayoutDashboard,
  Newspaper,
  Palette,
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
  | "risk"
  | "lottos"
  | "games"
  | "members"
  | "blocklist"
  | "finance"
  | "banks"
  | "promotions"
  | "activities"
  | "banners"
  | "news"
  | "theme"
  | "settings"
  | "staff"
  | "audit"
  | "security";
/** `also`: a second permission that opens the item on its own. */
export type Item = { href: string; key: ItemKey; icon: LucideIcon; need: Permission | null; also?: Permission; badge?: "finance" | "results" };

/** The back-office menu; labels come from the admin dictionary. `need: null` items are open to every staff member. */
export const NAV_GROUPS: { key: "overview" | "lotto" | "members" | "marketing" | "system"; items: Item[] }[] = [
  {
    key: "overview",
    items: [
      { href: "/", key: "dashboard", icon: LayoutDashboard, need: "dashboard.view" },
      { href: "/reports", key: "reports", icon: BarChart3, need: "reports.view" },
    ],
  },
  {
    key: "lotto",
    items: [
      { href: "/rounds", key: "rounds", icon: CalendarClock, need: "rounds.view" },
      { href: "/results", key: "results", icon: ClipboardCheck, need: "rounds.result", also: "rounds.confirm", badge: "results" },
      { href: "/risk", key: "risk", icon: Gauge, need: "risk.manage" },
      { href: "/lottos", key: "lottos", icon: Ticket, need: "lottos.manage" },
      { href: "/games", key: "games", icon: Gamepad2, need: "games.manage" },
    ],
  },
  {
    key: "members",
    items: [
      { href: "/members", key: "members", icon: Users, need: "members.view" },
      { href: "/blocklist", key: "blocklist", icon: Ban, need: "members.block" },
      { href: "/finance", key: "finance", icon: Banknote, need: "finance.view", badge: "finance" },
      { href: "/banks", key: "banks", icon: Landmark, need: "banks.view" },
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
      { href: "/security", key: "security", icon: ShieldCheck, need: null },
    ],
  },
];
