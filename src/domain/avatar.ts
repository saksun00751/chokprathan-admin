/** The emoji an employee may pick as their avatar. Pure; anything outside this list is refused. */
export const AVATAR_GROUPS = [
  { key: "faces", emojis: ["😀", "😄", "😎", "🤓", "🥳", "😇", "🤠", "🧐", "😺", "🤖", "👻", "👽", "🧑‍💻", "🦸"] },
  { key: "animals", emojis: ["🐶", "🐱", "🐼", "🐯", "🦁", "🐵", "🐸", "🐰", "🦊", "🐻", "🐨", "🐷", "🐘", "🦉"] },
  { key: "lucky", emojis: ["🍀", "💰", "💎", "🎲", "🎯", "🏆", "⭐", "🔥", "🌈", "🚀", "🐉", "🧧", "🪙", "👑"] },
] as const;

export type Avatar = (typeof AVATAR_GROUPS)[number]["emojis"][number];

const ALL: readonly unknown[] = AVATAR_GROUPS.flatMap((g) => g.emojis);

export const isAvatar = (v: unknown): v is Avatar => ALL.includes(v);

/** The stored value, or null (show the first letter of the name). */
export const avatarOf = (v: unknown): Avatar | null => (isAvatar(v) ? v : null);
