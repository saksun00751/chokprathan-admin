import { DEFAULT_ADJUST_LIMITS } from "@/domain/adjust";
import { BET_TYPES, BET_TYPE_ORDER } from "@/domain/betTypes";
import type { BetTypeCode, LottoGroup, ResultFormat, RiskProfile, Schedule } from "@/domain/types";

/** Seed catalog (spec §2). Editable later in /admin/lottos. */
export interface CatalogEntry {
  slug: string;
  name: string;
  short: string;
  grp: LottoGroup;
  format: ResultFormat;
  schedule: Schedule;
  delay: number;
  auto: boolean;
  flag: string;
}

const MON_FRI = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const stock = (slug: string, name: string, short: string, close: string, flag: string, delay = 15): CatalogEntry => ({
  slug,
  name,
  short,
  grp: "stock",
  format: "standard",
  schedule: { kind: "weekly", days: MON_FRI, close },
  delay,
  auto: true,
  flag,
});

export const LOTTO_CATALOG: CatalogEntry[] = [
  { slug: "thai-gov", name: "หวยรัฐบาลไทย", short: "รัฐบาลไทย", grp: "thai", format: "thai_gov", schedule: { kind: "monthly", days: [1, 16], close: "15:10" }, delay: 50, auto: false, flag: "TH" },
  { slug: "gsb", name: "หวยออมสิน", short: "ออมสิน", grp: "thai", format: "standard", schedule: { kind: "monthly", days: [16], close: "10:00" }, delay: 60, auto: false, flag: "TH" },
  { slug: "baac", name: "หวย ธ.ก.ส.", short: "ธ.ก.ส.", grp: "thai", format: "standard", schedule: { kind: "monthly", days: [16], close: "09:00" }, delay: 60, auto: false, flag: "TH" },

  { slug: "laos-pattana", name: "หวยลาวพัฒนา", short: "ลาวพัฒนา", grp: "foreign", format: "laos4", schedule: { kind: "weekly", days: [1, 3, 5], close: "20:15" }, delay: 25, auto: true, flag: "LA" },
  { slug: "laos-star", name: "หวยลาวสตาร์", short: "ลาวสตาร์", grp: "foreign", format: "laos4", schedule: { kind: "weekly", days: EVERY_DAY, close: "15:35" }, delay: 25, auto: true, flag: "LA" },
  { slug: "laos-vip", name: "หวยลาว VIP", short: "ลาว VIP", grp: "foreign", format: "laos4", schedule: { kind: "weekly", days: EVERY_DAY, close: "21:05" }, delay: 25, auto: true, flag: "LA" },
  { slug: "hanoi-special", name: "หวยฮานอยพิเศษ", short: "ฮานอยพิเศษ", grp: "foreign", format: "standard", schedule: { kind: "weekly", days: EVERY_DAY, close: "17:05" }, delay: 25, auto: true, flag: "VN" },
  { slug: "hanoi", name: "หวยฮานอยปกติ", short: "ฮานอยปกติ", grp: "foreign", format: "standard", schedule: { kind: "weekly", days: EVERY_DAY, close: "18:05" }, delay: 25, auto: true, flag: "VN" },
  { slug: "hanoi-vip", name: "หวยฮานอย VIP", short: "ฮานอย VIP", grp: "foreign", format: "standard", schedule: { kind: "weekly", days: EVERY_DAY, close: "19:05" }, delay: 25, auto: true, flag: "VN" },
  { slug: "malay", name: "หวยมาเลย์", short: "มาเลย์", grp: "foreign", format: "standard", schedule: { kind: "weekly", days: [0, 3, 6], close: "18:20" }, delay: 30, auto: true, flag: "MY" },

  stock("nikkei-am", "หุ้นนิเคอิเช้า", "นิเคอิเช้า", "09:25", "JP"),
  stock("china-am", "หุ้นจีนเช้า", "จีนเช้า", "10:25", "CN"),
  stock("hangseng-am", "หุ้นฮั่งเส็งเช้า", "ฮั่งเส็งเช้า", "10:50", "HK"),
  stock("taiwan", "หุ้นไต้หวัน", "ไต้หวัน", "12:30", "TW"),
  stock("korea", "หุ้นเกาหลี", "เกาหลี", "12:55", "KR"),
  stock("nikkei-pm", "หุ้นนิเคอิบ่าย", "นิเคอิบ่าย", "12:55", "JP"),
  stock("china-pm", "หุ้นจีนบ่าย", "จีนบ่าย", "13:55", "CN"),
  stock("hangseng-pm", "หุ้นฮั่งเส็งบ่าย", "ฮั่งเส็งบ่าย", "14:55", "HK"),
  stock("singapore", "หุ้นสิงคโปร์", "สิงคโปร์", "16:00", "SG"),
  stock("thai-stock", "หุ้นไทยเย็น", "หุ้นไทยเย็น", "16:00", "TH", 45),
  stock("india", "หุ้นอินเดีย", "อินเดีย", "17:00", "IN"),
  stock("egypt", "หุ้นอียิปต์", "อียิปต์", "19:00", "EG"),
  stock("russia", "หุ้นรัสเซีย", "รัสเซีย", "22:00", "RU"),
  stock("uk", "หุ้นอังกฤษ", "อังกฤษ", "22:30", "GB"),
  stock("germany", "หุ้นเยอรมัน", "เยอรมัน", "22:30", "DE"),
  {
    ...stock("dowjones", "หุ้นดาวโจนส์", "ดาวโจนส์", "00:30", "US", 180),
    schedule: { kind: "weekly", days: [2, 3, 4, 5, 6], close: "00:30" },
  },

  { slug: "yiki", name: "หวยยี่กี", short: "ยี่กี", grp: "yiki", format: "standard", schedule: { kind: "interval", firstClose: "06:00", everyMin: 15, count: 88 }, delay: 2, auto: true, flag: "YK" },
];

export const DEFAULT_RATES = Object.fromEntries(
  BET_TYPE_ORDER.map((code) => [code, BET_TYPES[code].defaultRate100]),
) as Record<BetTypeCode, number>;

export const DEFAULT_RISK: Record<BetTypeCode, RiskProfile> = {
  top4: { enabled: true, tiers: [{ threshold: 500, percent: 70 }], cap: 1000 },
  top3: { enabled: true, tiers: [{ threshold: 2000, percent: 75 }, { threshold: 5000, percent: 50 }], cap: 10000 },
  tod3: { enabled: true, tiers: [{ threshold: 3000, percent: 70 }], cap: 8000 },
  front3: { enabled: true, tiers: [{ threshold: 3000, percent: 70 }], cap: 8000 },
  bottom3: { enabled: true, tiers: [{ threshold: 3000, percent: 70 }], cap: 8000 },
  top2: { enabled: true, tiers: [{ threshold: 5000, percent: 75 }, { threshold: 15000, percent: 50 }], cap: 30000 },
  bottom2: { enabled: true, tiers: [{ threshold: 5000, percent: 75 }, { threshold: 15000, percent: 50 }], cap: 30000 },
  runTop: { enabled: true, tiers: [{ threshold: 20000, percent: 80 }], cap: 50000 },
  runBottom: { enabled: true, tiers: [{ threshold: 20000, percent: 80 }], cap: 50000 },
};

export interface BetLimits {
  minStake: number;
  maxPerBill: number;
  maxLines: number;
  maxPerNumber: Record<BetTypeCode, number>;
}

export const DEFAULT_LIMITS: BetLimits = {
  minStake: 1,
  maxPerBill: 50000,
  maxLines: 200,
  maxPerNumber: Object.fromEntries(
    BET_TYPE_ORDER.map((code) => [code, BET_TYPES[code].defaultMaxPerNumber]),
  ) as Record<BetTypeCode, number>,
};

export interface WalletSettings {
  depositMin: number;
  depositMax: number;
  withdrawMin: number;
  withdrawMax: number;
  withdrawPerDay: number;
  /** Credit deposits as soon as the member confirms. Only for demos: real money needs a human or a bank feed. */
  depositAutoApprove: boolean;
  /** Members must attach the transfer slip before confirming a deposit. */
  slipRequired: boolean;
  depositWindowMin: number;
  /** Before bank_accounts (migration 3) receiving accounts lived here; kept only so old settings still parse. */
  receivingAccounts: { bank: string; account: string; name: string }[];
  /** Size limits of one staff balance adjustment, in satang (see domain/adjust). */
  adjustMin: number;
  adjustMax: number;
}

/** Production-safe defaults: nothing is credited without review, and no receiving account until one is set. */
export const DEFAULT_WALLET: WalletSettings = {
  depositMin: 100_00,
  depositMax: 100_000_00,
  withdrawMin: 100_00,
  withdrawMax: 50_000_00,
  withdrawPerDay: 5,
  depositAutoApprove: false,
  slipRequired: true,
  depositWindowMin: 15,
  receivingAccounts: [],
  ...DEFAULT_ADJUST_LIMITS,
};

/** Percent values in basis points: 500 = 5.00%. */
export interface RewardSettings {
  cashbackBp: number;
  aff1Bp: number;
  aff2Bp: number;
}

export const DEFAULT_REWARDS: RewardSettings = { cashbackBp: 500, aff1Bp: 80, aff2Bp: 20 };

export interface SiteSettings {
  /** Shows demo accounts and OTP codes on screen. Never on for real money. */
  demoMode: boolean;
  /** Simulated members place bets so a demo shows exposure. Never on for real money. */
  simulateCrowd: boolean;
  /** Registration and password reset need an SMS code (needs an SMS provider in the environment). */
  otpRequired: boolean;
  registrationOpen: boolean;
  lineId: string;
  phone: string;
  announcement: string;
  /** The announcement in other languages; empty falls back to the Thai text. */
  announcementI18n: Partial<Record<"en" | "lo" | "my" | "km", string>>;
  cancelWindowMin: number;
  /** Every staff member must turn on 2-step sign-in before using the back office. */
  staffTotpRequired: boolean;
}

export const DEFAULT_SITE: SiteSettings = {
  demoMode: false,
  simulateCrowd: false,
  otpRequired: false,
  registrationOpen: true,
  lineId: "@chokprathan",
  phone: "02-000-0000",
  announcement: "ระบบปรับอัตราจ่ายเลขที่มียอดแทงสูงอัตโนมัติ ดูอัตราล่าสุดได้ก่อนกดยืนยันทุกครั้ง",
  announcementI18n: {
    en: "Rates on heavily played numbers are cut automatically. You always see the latest rate before you confirm.",
    lo: "ລະບົບປັບອັດຕາຈ່າຍຂອງເລກທີ່ມີຍອດແທງສູງອັດຕະໂນມັດ ເບິ່ງອັດຕາລ່າສຸດໄດ້ກ່ອນກົດຢືນຢັນທຸກຄັ້ງ",
    my: "ထိုးကြေးများသော နံပါတ်များ၏ ပေးချေနှုန်းကို စနစ်က အလိုအလျောက် လျှော့ချပါသည်။ အတည်မပြုမီ နောက်ဆုံးနှုန်းကို အမြဲမြင်ရပါမည်။",
    km: "ប្រព័ន្ធកាត់អត្រាសងលេខដែលមានការចាក់ច្រើនដោយស្វ័យប្រវត្តិ។ អ្នកឃើញអត្រាចុងក្រោយមុនពេលបញ្ជាក់ជានិច្ច។",
  },
  cancelWindowMin: 15,
  staffTotpRequired: false,
};
