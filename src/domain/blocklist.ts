/**
 * Blocking members: a bank account (at one bank or any), a phone number, or a first name and
 * surname. Whoever matches cannot register, sign in, or withdraw. Values are compared the way people
 * type them: digits only for accounts, local 10-digit phones, and names without titles, spacing, or
 * letter-case differences.
 */
export const BLOCK_KINDS = ["bank", "phone", "name"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const isBlockKind = (v: unknown): v is BlockKind => (BLOCK_KINDS as readonly unknown[]).includes(v);

/** Titles with a dot may touch the name ("น.ส.สมหญิง"); bare ones need a space, so "นางฟ้า" stays whole. */
const TITLE = /^(?:(?:น\.ส\.|นส\.|ด\.ช\.|ด\.ญ\.|mrs\.|mr\.|ms\.|dr\.)\s*|(?:นางสาว|นาง|นาย|mrs|mr|ms|miss|dr)\s+)/;

export function normalizeName(input: string): string {
  const s = input
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .trim();
  return s.replace(TITLE, "").replace(/\s+/g, " ").trim();
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("66") ? `0${digits.slice(2)}` : digits;
}

export const normalizeAccount = (input: string) => input.replace(/\D/g, "");

export type BlockInput = { kind: BlockKind; bankCode?: string | null; value?: string; first?: string; last?: string };

/** The stored form of a new entry (and how to show it), or which field is unusable. */
export function blockKey(input: BlockInput): { ok: true; bankCode: string | null; value: string; display: string } | { ok: false; problem: BlockKind } {
  switch (input.kind) {
    case "bank": {
      const account = normalizeAccount(input.value ?? "");
      if (account.length < 6 || account.length > 20) return { ok: false, problem: "bank" };
      return { ok: true, bankCode: input.bankCode || null, value: account, display: account };
    }
    case "phone": {
      const phone = normalizePhone(input.value ?? "");
      if (!/^0\d{8,9}$/.test(phone)) return { ok: false, problem: "phone" };
      return { ok: true, bankCode: null, value: phone, display: phone };
    }
    case "name": {
      const first = normalizeName(input.first ?? "");
      const last = normalizeName(input.last ?? "");
      if (!first || !last || first.length > 60 || last.length > 60) return { ok: false, problem: "name" };
      return { ok: true, bankCode: null, value: `${first} ${last}`, display: `${first} ${last}` };
    }
  }
}

/** What is known about a member or someone registering. */
export interface Identity {
  phone: string | null;
  bankCode: string | null;
  bankAccount: string | null;
  name: string | null;
  /** the account holder's name on the bank book */
  bankName: string | null;
}

export interface BlockEntry {
  kind: string;
  bankCode: string | null;
  value: string;
}

export function matchesBlock(entry: BlockEntry, who: Identity): boolean {
  switch (entry.kind) {
    case "bank":
      return !!who.bankAccount && normalizeAccount(who.bankAccount) === entry.value && (entry.bankCode === null || entry.bankCode === who.bankCode);
    case "phone":
      return !!who.phone && normalizePhone(who.phone) === entry.value;
    case "name":
      return [who.name, who.bankName].some((n) => !!n && normalizeName(n) === entry.value);
    default:
      return false;
  }
}
