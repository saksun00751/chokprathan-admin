/** The office portraits an employee may pick as their avatar. Pure; anything else is refused. */

/**
 * `face-*` are picture files, `staff-*` are drawn in code (components/admin/staff-avatar.tsx).
 * The drawn ones keep their numbers: they are stored in the database.
 */
export const PORTRAITS = [
  { id: "face-1", gender: "male" },
  { id: "face-2", gender: "female" },
  { id: "face-3", gender: "male" },
  { id: "face-4", gender: "female" },
  { id: "face-5", gender: "male" },
  { id: "face-6", gender: "female" },
  { id: "face-7", gender: "male" },
  { id: "face-8", gender: "female" },
  { id: "face-9", gender: "female" },
  { id: "face-10", gender: "male" },
  { id: "face-11", gender: "female" },
  { id: "staff-1", gender: "male" },
  { id: "staff-2", gender: "female" },
  { id: "staff-3", gender: "male" },
  { id: "staff-4", gender: "female" },
  { id: "staff-5", gender: "male" },
  { id: "staff-6", gender: "female" },
  { id: "staff-7", gender: "male" },
  { id: "staff-8", gender: "female" },
  { id: "staff-9", gender: "male" },
  { id: "staff-10", gender: "female" },
  { id: "staff-11", gender: "male" },
  { id: "staff-12", gender: "female" },
  { id: "staff-13", gender: "male" },
  { id: "staff-14", gender: "female" },
] as const;

export type Avatar = (typeof PORTRAITS)[number]["id"];

export const isAvatar = (v: unknown): v is Avatar => PORTRAITS.some((p) => p.id === v);

/** The stored value, or null (show the first letter of the name). */
export const avatarOf = (v: unknown): Avatar | null => (isAvatar(v) ? v : null);
