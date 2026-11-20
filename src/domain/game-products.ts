/**
 * Game products from the aggregator (AMB SuperAPI, seamless products only), grouped the way the
 * site shows them: slots, live casino, sports, and everything else (cards, keno, fishing, ...).
 * The aggregator decides which products an agent may use; this list only names and groups them.
 */
export const GAME_GROUPS = ["slot", "casino", "sport", "other"] as const;
export type GameGroup = (typeof GAME_GROUPS)[number];

export const isGameGroup = (v: unknown): v is GameGroup => (GAME_GROUPS as readonly unknown[]).includes(v);

const PRODUCTS: Record<string, [name: string, group: GameGroup]> = {
  "1UP_SPIN": ["1Up Spin", "slot"],
  "5G_GAMES": ["5G Games", "slot"],
  "759GAMING": ["759 Gaming", "slot"],
  "918KISS": ["918Kiss", "slot"],
  ACE333: ["Ace333", "slot"],
  ADVANT: ["Advant Play", "slot"],
  AFB1188_SLOT: ["AFB1188 Slot", "slot"],
  AMBGAMING: ["SpinGo", "slot"],
  AMEBA: ["Ameba", "slot"],
  ASKMEBET: ["Askmebet", "slot"],
  ASKMESLOT: ["Askmeslot", "slot"],
  BIGPOT: ["Bigpot", "slot"],
  BIGTIME: ["BigTime Gaming", "slot"],
  BOOMING: ["Booming", "slot"],
  BOOONGO: ["Booongo", "slot"],
  CG: ["Creative Gaming", "slot"],
  CLOTPLAY: ["ClotPlay", "slot"],
  CQ9: ["CQ9", "slot"],
  DRAGONGAMING: ["Dragon Gaming", "slot"],
  EAZYGAMING: ["Eazy Gaming", "slot"],
  ENDORPHINA: ["Endorphina", "slot"],
  EVOPLAY: ["Evoplay", "slot"],
  EXPANSE: ["Expanse", "slot"],
  FACHAI: ["Fachai", "slot"],
  FUNKY: ["Funky Games", "slot"],
  FUNTA: ["Funta", "slot"],
  GOLDY: ["Goldy", "slot"],
  HABANERO: ["Habanero", "slot"],
  HACKSAW: ["Hacksaw", "slot"],
  HECTICPLAY: ["Hectic Play", "slot"],
  HOTDOG: ["Hotdog", "slot"],
  I8: ["I8", "slot"],
  JILI: ["Jili", "slot"],
  JIMI: ["Jimi Gaming", "slot"],
  JOKER: ["Joker123", "slot"],
  KAGAME: ["KA Gaming", "slot"],
  LIVE22: ["Live22", "slot"],
  MANCALA: ["Mancala Gaming", "slot"],
  MANNA: ["Mannaplay", "slot"],
  MICRO: ["Micro Gaming", "slot"],
  MIMI: ["Mimi Gaming", "slot"],
  NETENT: ["NetEnt", "slot"],
  NEXTSPIN: ["Nextspin", "slot"],
  NINESGAME: ["Nines Game", "slot"],
  NINJA: ["Ninja Slot", "slot"],
  NOLIMIT: ["Nolimit City", "slot"],
  OCTOPLAY: ["Penguin King", "slot"],
  PETERNSONS: ["Peter & Sons", "slot"],
  PGSOFT: ["PG Soft", "slot"],
  PRAGMATICPLAY_SLOT: ["Pragmatic Play Slot", "slot"],
  PRAGMATIC_SLOT: ["Pragmatic Play Slot Global", "slot"],
  REDTIGER: ["Red Tiger", "slot"],
  RELAX: ["Relax Gaming", "slot"],
  RICH88: ["Rich88", "slot"],
  ROYAL: ["Royal Slot Gaming", "slot"],
  SEXY_SLOT: ["Sexy Slot", "slot"],
  SIMPLEPLAY: ["Simple Play", "slot"],
  SLOTOPIA: ["Slotopia", "slot"],
  SLOTXO: ["Slotxo", "slot"],
  SPADE: ["Spade Gaming", "slot"],
  SUNNI: ["Sunni Games", "slot"],
  WAZDAN: ["Wazdan", "slot"],
  WMSLOT: ["WMSlot", "slot"],
  YGGDRASIL: ["Yggdrasil Gaming", "slot"],
  YGR: ["Ygr", "slot"],
  AFB1188_LIVECASINO: ["AFB1188 Livecasino", "casino"],
  AGGAME: ["Choice", "casino"],
  ALLBET: ["AllBet", "casino"],
  BETGAME: ["BetgamesTV", "casino"],
  BIGGAME: ["Big Gaming", "casino"],
  CQ9_LIVECASINO: ["Motivation Gaming", "casino"],
  DREAM: ["Dream Gaming", "casino"],
  EVOLUTION: ["Evolution", "casino"],
  MICRO_LIVECASINO: ["Micro Gaming LiveCasino", "casino"],
  OFALIVE: ["MT Live", "casino"],
  ONCASINO: ["ONLive", "casino"],
  ONEPOWER: ["One Power", "casino"],
  PRAGMATIC_LIVECASINO: ["Pragmatic Play LiveCasino", "casino"],
  PRETTY: ["Pretty Gaming", "casino"],
  SAGAME: ["SA Gaming", "casino"],
  SEXY: ["Sexy Gaming", "casino"],
  VIVO: ["Vivo Gaming", "casino"],
  WECASINO: ["WE Casino", "casino"],
  WINFINITY: ["Winfinity", "casino"],
  WM: ["WM Casino", "casino"],
  YEEBET: ["Yeebet", "casino"],
  AFB1188: ["AFB1188", "sport"],
  AMBSPORTBOOK: ["AmbSportbook", "sport"],
  AOG: ["AOG", "sport"],
  COCKFIGHT: ["Cockfight", "sport"],
  DBSPORT: ["DB Sport", "sport"],
  FB_SPORT: ["FB Sport", "sport"],
  GA28: ["GA28", "sport"],
  LALIKA: ["Lalika", "sport"],
  MUAYPAKYOK: ["Muaypakyok", "sport"],
  SABASPORTS: ["Saba Sport", "sport"],
  SBO: ["Sbobet", "sport"],
  TFGAME: ["TF Gaming", "sport"],
  UFABET: ["Ufabet+", "sport"],
  UMBET: ["Umbet", "sport"],
  AMBPOKER: ["Ambpoker", "other"],
  KINGMAKER: ["King Midas", "other"],
  KINGPOKER: ["KingPoker", "other"],
  KSGAME: ["KS Game", "other"],
  MIKIWORLD: ["Miki Worlds", "other"],
  MINILUCK: ["Miniluck", "other"],
  KENO: ["Keno", "other"],
};

/** The group of a product; one the list does not know yet goes by its games' type. */
export function groupOf(productId: string, gameType?: string): GameGroup {
  const known = PRODUCTS[productId];
  if (known) return known[1];
  const type = (gameType ?? "").toUpperCase();
  if (type.includes("SLOT") || type === "EGAMES") return "slot";
  if (type.includes("CASINO")) return "casino";
  if (type.includes("SPORT")) return "sport";
  return "other";
}

export const productName = (productId: string) => PRODUCTS[productId]?.[0] ?? productId;

/** Members play under "<prefix><6-digit id>": stable, carries no personal data, and maps back. */
export const ambUsername = (prefix: string, userId: number) => `${prefix}${String(userId).padStart(6, "0")}`;

export function userIdOf(prefix: string, username: unknown): number | null {
  if (typeof username !== "string" || username.length > 40) return null;
  const lower = username.toLowerCase();
  if (!lower.startsWith(prefix)) return null;
  const rest = lower.slice(prefix.length);
  return /^\d{1,10}$/.test(rest) ? Number(rest) : null;
}
