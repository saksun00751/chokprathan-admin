/** Back-office permissions. A staff role holds a list of these; the owner role holds "*". Labels live in the admin dictionary. */
export const PERMISSIONS = [
  { id: "dashboard.view", group: "overview" },
  { id: "reports.view", group: "overview" },
  { id: "reports.export", group: "overview" },

  { id: "rounds.view", group: "lotto" },
  { id: "rounds.result", group: "lotto" },
  { id: "rounds.confirm", group: "lotto" },
  { id: "rounds.cancel", group: "lotto" },
  { id: "risk.manage", group: "lotto" },
  { id: "lottos.manage", group: "lotto" },

  { id: "members.view", group: "members" },
  { id: "members.contact", group: "members" },
  { id: "members.manage", group: "members" },
  { id: "members.adjust", group: "members" },
  { id: "members.edit", group: "members" },
  { id: "members.delete", group: "members" },
  { id: "members.points", group: "members" },
  { id: "members.block", group: "members" },

  { id: "finance.view", group: "finance" },
  { id: "finance.deposit", group: "finance" },
  { id: "finance.withdraw", group: "finance" },
  { id: "banks.view", group: "finance" },
  { id: "banks.manage", group: "finance" },
  { id: "banks.adjust", group: "finance" },

  { id: "promotions.manage", group: "marketing" },
  { id: "content.manage", group: "marketing" },

  { id: "settings.manage", group: "system" },
  { id: "theme.manage", group: "system" },
  { id: "games.manage", group: "system" },
  { id: "staff.manage", group: "system" },
  { id: "audit.view", group: "system" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["id"];
export const ALL = "*";

export const isPermission = (v: unknown): v is Permission => PERMISSIONS.some((p) => p.id === v);

export function hasPermission(granted: readonly string[], need: Permission): boolean {
  return granted.includes(ALL) || granted.includes(need);
}

/* ---------- no privilege escalation ---------- */

/** What the escalation rules need to know about a staff member or a role. */
export interface Rank {
  isOwner: boolean;
  permissions: readonly string[];
}

/** Whoever holds `actor` may hand out `target` only when they hold every one of those permissions. */
export function canGrant(actor: readonly string[], target: readonly string[]): boolean {
  if (actor.includes(ALL)) return true;
  return target.every((p) => p !== ALL && actor.includes(p));
}

/**
 * May `actor` act on staff in `role` (give the role, edit, suspend, reset password or 2-step)?
 * Owner accounts and the owner role belong to owners; anyone else needs every permission of the role,
 * so a staff manager can never raise themselves or take over someone who outranks them.
 */
export function canActOnRole(actor: Rank, role: Rank): boolean {
  if (role.isOwner) return actor.isOwner;
  return actor.isOwner || canGrant(actor.permissions, role.permissions);
}

/** May `actor` create a role (`before` null) or change one to `permissions`? The owner role is fixed. */
export function mayEditRole(actor: Rank, before: Rank | null, permissions: readonly string[]): boolean {
  if (before?.isOwner) return false;
  if (before && !canActOnRole(actor, before)) return false;
  return actor.isOwner || canGrant(actor.permissions, permissions);
}

/** Roles created on a fresh install. The owner role cannot be edited or deleted. */
export const DEFAULT_ROLES: { name: string; description: string; permissions: string[]; isOwner?: boolean }[] = [
  { name: "เจ้าของระบบ", description: "ทำได้ทุกอย่าง รวมถึงจัดการพนักงานและสิทธิ์", permissions: [ALL], isOwner: true },
  {
    name: "ผู้จัดการ",
    description: "ดูแลทุกส่วนยกเว้นพนักงานและการตั้งค่าระบบ",
    permissions: PERMISSIONS.map((p) => p.id).filter((id) => id !== "staff.manage" && id !== "settings.manage"),
  },
  {
    name: "การเงิน",
    description: "ตรวจและอนุมัติรายการฝากถอน",
    permissions: [
      "dashboard.view",
      "reports.view",
      "members.view",
      "members.contact",
      "finance.view",
      "finance.deposit",
      "finance.withdraw",
      "banks.view",
      "banks.adjust",
    ],
  },
  {
    name: "ดูแลหวย",
    description: "กรอกผล ดูยอดแทงรายเลข และอั้นเลข",
    permissions: ["dashboard.view", "rounds.view", "rounds.result", "rounds.confirm", "risk.manage"],
  },
  {
    name: "ซัพพอร์ต",
    description: "ตอบคำถามสมาชิก ดูข้อมูลได้อย่างเดียว",
    permissions: ["dashboard.view", "members.view", "finance.view", "rounds.view"],
  },
  {
    name: "การตลาด",
    description: "จัดการโปรโมชั่น คูปอง แบนเนอร์ และข่าว",
    permissions: ["dashboard.view", "reports.view", "promotions.manage", "content.manage"],
  },
];
