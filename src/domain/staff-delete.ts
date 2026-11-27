/** Why `actor` may not delete the staff account `targetId`, or null when they may. Pure; the screen and the server both ask. */
export function staffDeleteProblem(actor: { id: number; isOwner: boolean }, targetId: number): "ownerOnly" | "self" | null {
  if (!actor.isOwner) return "ownerOnly";
  return actor.id === targetId ? "self" : null;
}
