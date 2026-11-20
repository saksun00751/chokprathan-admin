/** Bank names live in the dictionaries (t.lotto.banks). */
export interface Bank {
  code: string;
  /** OKLCH hue for the small bank badge. */
  hue: number;
}

export const BANKS: Bank[] = [
  { code: "kbank", hue: 150 },
  { code: "scb", hue: 300 },
  { code: "bbl", hue: 255 },
  { code: "ktb", hue: 230 },
  { code: "bay", hue: 85 },
  { code: "ttb", hue: 245 },
  { code: "gsb", hue: 340 },
  { code: "baac", hue: 135 },
  { code: "kkp", hue: 270 },
  { code: "cimb", hue: 20 },
  { code: "uob", hue: 260 },
  { code: "lhb", hue: 200 },
  { code: "ghb", hue: 40 },
];

export const bankByCode = (code: string | null | undefined) => BANKS.find((b) => b.code === code);

/** "xxx-x-x4567-x" style masking: keep the last 4 digits. */
export function maskAccount(account: string | null | undefined): string {
  if (!account) return "-";
  const digits = account.replace(/\D/g, "");
  return digits.length <= 4 ? digits : `${"•".repeat(Math.min(6, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  return phone.length >= 10 ? `${phone.slice(0, 3)}-xxx-${phone.slice(-4)}` : phone;
}
