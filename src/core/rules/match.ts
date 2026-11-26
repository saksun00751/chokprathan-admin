import type { BetTypeCode, ResultFormat, RoundResult } from "./types";

export interface ResultInput {
  top3?: string;
  bottom2?: string;
  top4?: string;
  first6?: string;
  front3?: string[];
  back3?: string[];
}

export type DeriveResult = { ok: true; result: RoundResult } | { ok: false; error: string };

/** What a bad result entry says; the caller passes the request's language (Thai by default). */
export interface ResultMessages {
  pair: string;
  top3: string;
  bottom2: string;
  first6: string;
  top4: string;
  front3: string;
  back3: string;
}

const TH: ResultMessages = {
  pair: "{label}ต้องกรอกเลข 3 หลัก 2 ชุด",
  top3: "3 ตัวบนต้องเป็นตัวเลข 3 หลัก",
  bottom2: "2 ตัวล่างต้องเป็นตัวเลข 2 หลัก",
  first6: "รางวัลที่ 1 ต้องเป็นตัวเลข 6 หลัก",
  top4: "เลข 4 ตัวต้องเป็นตัวเลข 4 หลัก",
  front3: "3 ตัวหน้า",
  back3: "3 ตัวท้าย",
};

/** A string of exactly `n` digits. The input may come straight from a request: check the type too. */
const digits = (n: number) => ({ test: (v: unknown): v is string => typeof v === "string" && new RegExp(`^[0-9]{${n}}$`).test(v) });
const fail = (error: string): DeriveResult => ({ ok: false, error });

function pair(list: string[] | undefined, label: string, m: ResultMessages): [string, string] | string {
  if (!Array.isArray(list) || list.length !== 2 || !list.every((x) => digits(3).test(x))) {
    return m.pair.replace("{label}", label);
  }
  return [list[0], list[1]];
}

/** Validate what the admin typed and derive every field the matcher needs. */
export function deriveResult(format: ResultFormat, typed: ResultInput, m: ResultMessages = TH): DeriveResult {
  const input: ResultInput = typed && typeof typed === "object" ? typed : {};
  switch (format) {
    case "standard": {
      if (!digits(3).test(input.top3 ?? "")) return fail(m.top3);
      if (!digits(2).test(input.bottom2 ?? "")) return fail(m.bottom2);
      return { ok: true, result: { top3: input.top3!, bottom2: input.bottom2! } };
    }
    case "thai_gov": {
      if (!digits(6).test(input.first6 ?? "")) return fail(m.first6);
      const front3 = pair(input.front3, m.front3, m);
      if (typeof front3 === "string") return fail(front3);
      const back3 = pair(input.back3, m.back3, m);
      if (typeof back3 === "string") return fail(back3);
      if (!digits(2).test(input.bottom2 ?? "")) return fail(m.bottom2);
      const first6 = input.first6!;
      return {
        ok: true,
        result: { first6, top3: first6.slice(3), front3, back3, bottom2: input.bottom2! },
      };
    }
    case "laos4": {
      if (!digits(4).test(input.top4 ?? "")) return fail(m.top4);
      const top4 = input.top4!;
      return { ok: true, result: { top4, top3: top4.slice(1), bottom2: top4.slice(0, 2) } };
    }
  }
}

const sortDigits = (n: string) => n.split("").sort().join("");

export function isWinning(code: BetTypeCode, n: string, r: RoundResult): boolean {
  switch (code) {
    case "top4":
      return r.top4 !== undefined && n === r.top4;
    case "top3":
      return n === r.top3;
    case "tod3":
      return n.length === 3 && sortDigits(n) === sortDigits(r.top3);
    case "front3":
      return r.front3?.includes(n) ?? false;
    case "bottom3":
      return r.back3?.includes(n) ?? false;
    case "top2":
      return n === r.top3.slice(1);
    case "bottom2":
      return n === r.bottom2;
    case "runTop":
      return n.length === 1 && r.top3.includes(n);
    case "runBottom":
      return n.length === 1 && r.bottom2.includes(n);
  }
}
