import { describe, expect, it } from "vitest";
import * as debt from "../wallet/debt";
import * as adjust from "./adjust";
import * as betTypes from "./betTypes";
import * as match from "./match";
import * as money from "./money";
import * as numbers from "./numbers";
import * as pricing from "./pricing";
import * as quote from "./quote";
import * as roundConfig from "./roundConfig";
import * as schedule from "./schedule";
import * as slip from "./slip";
import * as time from "./time";

/** Both apps import these names. Removing or renaming one is a breaking change: bump the tag. */
const SURFACE: [string, object, string[]][] = [
  ["wallet/debt", debt, ["collectDebt", "outstandingDebt"]],
  ["adjust", adjust, ["ADJUST_CEILING", "DEFAULT_ADJUST_LIMITS", "adjustLimitError"]],
  ["betTypes", betTypes, ["BET_TYPES", "BET_TYPE_ORDER", "betTypesFor", "isBetTypeCode", "isValidNumber"]],
  ["match", match, ["deriveResult", "isWinning"]],
  ["money", money, ["averageRate100", "formatBaht", "formatCompactBaht", "formatRate", "payoutOf"]],
  ["numbers", numbers, ["doubles", "nineteenDoors", "permutations", "swipeBack", "swipeFront", "triples", "uniq"]],
  ["pricing", pricing, ["marginalRate100", "priceStake", "validateProfile"]],
  ["quote", quote, ["betRules", "priceSlip", "slipKey"]],
  ["roundConfig", roundConfig, ["MAX_DISCOUNT_BP", "buildRoundConfig", "discountOf", "netOf"]],
  ["slip", slip, ["MAX_PASTE_LINES", "MAX_STAKE", "pairGroup", "parseSlipText"]],
  ["schedule", schedule, ["closesForDay", "nextClose", "opensOnDay", "previousClose"]],
  [
    "time",
    time,
    [
      "BKK_OFFSET_MS", "DAY", "HOUR", "MINUTE", "WEEKDAYS_SHORT", "addDays", "bkkMs", "bkkParts", "dayKey",
      "dayStartMs", "formatClock", "formatDateTime", "formatThaiDate", "parseDayKey", "splitCountdown",
    ],
  ],
];

describe("public surface", () => {
  it.each(SURFACE)("%s exports exactly the agreed names", (_name, module, names) => {
    expect(Object.keys(module).sort()).toEqual([...names].sort());
  });
});
