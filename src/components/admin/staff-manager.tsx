"use client";

import { useI18n } from "@/i18n/client";
import { fmt, formatDateTime } from "@/i18n/format";
import { KeyRound, Pencil, Plus, ShieldCheck, ShieldOff, Trash2, UserPlus } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { changedRows } from "@/domain/confirm";
import { ALL, PERMISSIONS, canActOnRole, canGrant, type Rank } from "@/domain/permissions";
import type { AnyActionResult } from "@/lib/action";
import { createStaffAction, deleteRoleAction, resetStaffPasswordAction, resetStaffTotpAction, saveRoleAction, updateStaffAction } from "@/server/actions/admin";
import type { StaffMember, StaffRole } from "@/server/services/employees";

function useRun() {
  const done = useI18n().t.admin.people.staff.done;
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<AnyActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? done);
        after?.();
      } else toast.error(r.error);
    });
  return { pending, run };
}

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

/* ---------------- staff list ---------------- */

/** The signed-in staff member: the screen offers only what the server would allow them. */
export type StaffViewer = { id: number } & Rank;

const rankOf = (member: StaffMember, roles: StaffRole[]): Rank => roles.find((r) => r.id === member.roleId) ?? { isOwner: false, permissions: [] };

export function StaffTable({ staff, roles, viewer }: { staff: StaffMember[]; roles: StaffRole[]; viewer: StaffViewer }) {
  const { lang, t } = useI18n();
  const st = t.admin.people.staff;
  const viewerId = viewer.id;
  // Roles this person may hand out: never the owner role (unless an owner), never more than they hold.
  const assignable = roles.filter((r) => canActOnRole(viewer, r));
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{st.heading}</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          {st.add}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-panel text-xs text-ink-3">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                {st.staffMember}
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                {st.role}
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                {st.status}
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                {st.twoStep}
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                {st.lastLogin}
              </th>
              <th scope="col" className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2.5">
                  <span className="block font-medium text-ink">
                    {s.name} {s.id === viewerId && <span className="text-xs font-normal text-ink-3">{st.you}</span>}
                  </span>
                  <span className="block text-xs text-ink-3">{s.username}</span>
                </td>
                <td className="px-3 py-2.5">{s.isOwner ? <Badge tone="gold">{s.roleName}</Badge> : <Badge tone="brand">{s.roleName ?? "-"}</Badge>}</td>
                <td className="px-3 py-2.5">
                  {s.status === "active" ? <Badge tone="success">{st.active}</Badge> : <Badge tone="danger">{st.suspended}</Badge>}
                </td>
                <td className="px-3 py-2.5">
                  {s.totpEnabled ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      {st.on}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <ShieldOff className="size-4" aria-hidden="true" />
                      {st.off}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">
                  {s.lastLoginAt ? formatDateTime(s.lastLoginAt, lang) : "-"}
                  {s.lastIp && <span className="tnum block text-xs text-ink-3">{s.lastIp}</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {canActOnRole(viewer, rankOf(s, roles)) && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                      <Pencil className="size-4" aria-hidden="true" />
                      {st.manage}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateStaffSheet open={creating} onClose={() => setCreating(false)} roles={assignable} />
      {editing && <EditStaffSheet key={editing.id} member={editing} roles={assignable} isSelf={editing.id === viewerId} onClose={() => setEditing(null)} />}
    </>
  );
}

function CreateStaffSheet({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: StaffRole[] }) {
  const { t } = useI18n();
  const st = t.admin.people.staff;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [v, setV] = useState({ username: "", name: "", password: "", roleId: String(roles.find((r) => !r.isOwner)?.id ?? roles[0]?.id ?? "") });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={st.add}
      description={st.createDescription}
      footer={
        <Button
          className="w-full"
          loading={pending}
          onClick={async () => {
            const answer = await ask({
              title: k.createStaff,
              details: [
                [st.username, v.username || "-"],
                [st.name, v.name || "-"],
                [st.role, roles.find((r) => String(r.id) === v.roleId)?.name ?? "-"],
              ],
            });
            if (!answer.ok) return;
            run(
              () => createStaffAction({ ...v, roleId: Number(v.roleId) }),
              () => {
                setV({ username: "", name: "", password: "", roleId: v.roleId });
                onClose();
              },
            );
          }}
        >
          {st.add}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={st.username} htmlFor="st-username" hint={st.usernameHint}>
          <Input id="st-username" autoComplete="off" value={v.username} onChange={(e) => setV({ ...v, username: e.target.value.toLowerCase() })} />
        </Field>
        <Field label={st.name} htmlFor="st-name">
          <Input id="st-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label={st.tempPassword} htmlFor="st-pass" hint={st.passwordHint}>
          <Input id="st-pass" type="text" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        </Field>
        <Field label={st.role} htmlFor="st-role">
          <Select id="st-role" value={v.roleId} onChange={(e) => setV({ ...v, roleId: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

function EditStaffSheet({ member, roles, isSelf, onClose }: { member: StaffMember; roles: StaffRole[]; isSelf: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const st = t.admin.people.staff;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const { pending, run } = useRun();
  const who = `${member.name} (${member.username ?? ""})`;
  const roleName = (id: string) => roles.find((r) => String(r.id) === id)?.name ?? "-";
  const statusName = (x: string) => (x === "active" ? st.active : st.suspendOption);
  const [v, setV] = useState({ name: member.name, roleId: String(member.roleId ?? ""), status: member.status });
  const [password, setPassword] = useState("");
  return (
    <Sheet
      open
      onClose={onClose}
      title={fmt(st.manageTitle, { name: member.name })}
      description={fmt(st.usernameLine, { username: member.username ?? "" })}
      footer={
        <Button
          className="w-full"
          loading={pending}
          onClick={async () => {
            const rows = changedRows<string>([
              { label: st.name, before: member.name, after: v.name },
              { label: st.role, before: roleName(String(member.roleId ?? "")), after: roleName(v.roleId) },
              { label: st.status, before: statusName(member.status), after: statusName(v.status) },
            ]);
            if (rows.length === 0) {
              toast.info(k.noChanges);
              return;
            }
            const answer = await ask({
              title: k.updateStaff,
              tone: v.status === "suspended" && member.status !== "suspended" ? "danger" : "default",
              details: [[st.username, member.username ?? "-"], ...rows.map((r): [string, string] => [r.label, `${r.before} → ${r.after}`])],
            });
            if (answer.ok) run(() => updateStaffAction(member.id, { name: v.name, roleId: Number(v.roleId), status: v.status }), onClose);
          }}
        >
          {st.save}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={st.name} htmlFor="ed-name">
          <Input id="ed-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label={st.role} htmlFor="ed-role" hint={st.roleHint}>
          <Select id="ed-role" value={v.roleId} onChange={(e) => setV({ ...v, roleId: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={st.status} htmlFor="ed-status">
          <Select id="ed-status" value={v.status} disabled={isSelf} onChange={(e) => setV({ ...v, status: e.target.value as "active" | "suspended" })}>
            <option value="active">{st.active}</option>
            <option value="suspended">{st.suspendOption}</option>
          </Select>
        </Field>

        <div className="rounded-card border border-line p-3">
          <p className="text-sm font-medium text-ink">{st.newPassword}</p>
          <p className="text-xs text-ink-3">{st.newPasswordHint}</p>
          <div className="mt-2 flex gap-2">
            <Input
              aria-label={st.newPasswordLabel}
              type="text"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={st.newPasswordPlaceholder}
            />
            <Button
              variant="secondary"
              loading={pending}
              onClick={async () => {
                const answer = await ask({ title: k.resetStaffPassword, details: [[k.member, who]], note: st.newPasswordHint });
                if (answer.ok)
                  run(
                    () => resetStaffPasswordAction(member.id, password),
                    () => setPassword(""),
                  );
              }}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              {st.setPassword}
            </Button>
          </div>
        </div>
        {member.totpEnabled && (
          <div className="rounded-card border border-line p-3">
            <p className="text-sm font-medium text-ink">{st.resetTotp}</p>
            <p className="text-xs text-ink-3">{st.resetTotpHint}</p>
            <Button
              className="mt-2"
              variant="secondary"
              loading={pending}
              onClick={async () => {
                const answer = await ask({ title: k.resetStaffTotp, tone: "danger", details: [[k.member, who]], note: st.resetTotpHint });
                if (answer.ok) run(() => resetStaffTotpAction(member.id), onClose);
              }}
            >
              <ShieldOff className="size-4" aria-hidden="true" />
              {st.resetTotpButton}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- roles and permission matrix ---------------- */

export function RolesPanel({ roles, viewer }: { roles: StaffRole[]; viewer: StaffViewer }) {
  const { t } = useI18n();
  const st = t.admin.people.staff;
  const [editing, setEditing] = useState<StaffRole | "new" | null>(null);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{st.roles}</h2>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden="true" />
          {st.addRole}
        </Button>
      </div>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {roles.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {r.name} <span className="text-xs font-normal text-ink-3">{fmt(st.people, { n: r.members })}</span>
                </p>
                <p className="text-sm text-ink-2">{r.description}</p>
              </div>
              {!r.isOwner && canActOnRole(viewer, r) && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  {st.editRole}
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-3">
              {r.permissions.includes(ALL)
                ? st.allPerms
                : fmt(st.permCount, {
                    n: r.permissions.length,
                    list: PERMISSIONS.filter((p) => r.permissions.includes(p.id))
                      .map((p) => t.admin.shell.perms[p.id] ?? p.id)
                      .join(" · "),
                  })}
            </p>
          </li>
        ))}
      </ul>
      {editing && (
        <RoleSheet key={editing === "new" ? "new" : editing.id} role={editing === "new" ? null : editing} viewer={viewer} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function RoleSheet({ role, viewer, onClose }: { role: StaffRole | null; viewer: StaffViewer; onClose: () => void }) {
  const { t } = useI18n();
  const st = t.admin.people.staff;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const permName = (id: string) => t.admin.shell.perms[id as keyof typeof t.admin.shell.perms] ?? id;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [granted, setGranted] = useState<Set<string>>(
    new Set(role?.permissions ?? (canGrant(viewer.permissions, ["dashboard.view"]) ? ["dashboard.view"] : [])),
  );
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) =>
    setGranted((g) => {
      const next = new Set(g);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={role ? fmt(st.editRoleTitle, { name: role.name }) : st.addRole}
      description={viewer.isOwner ? st.roleDescription : `${st.roleDescription} ${st.grantHint}`}
      footer={
        <div className="flex w-full gap-2">
          {role && role.members === 0 && (
            <Button
              variant="dangerGhost"
              loading={pending}
              onClick={async () => {
                const answer = await ask({ title: k.deleteRole, tone: "danger", details: [[st.roleName, role.name]], confirmLabel: st.delete });
                if (answer.ok) run(() => deleteRoleAction(role.id), onClose);
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {st.delete}
            </Button>
          )}
          <Button
            className="flex-1"
            loading={pending}
            onClick={async () => {
              if (granted.size === 0) return setError(st.pickPermission);
              setError(null);
              const before = new Set(role?.permissions ?? []);
              const added = PERMISSIONS.filter((p) => granted.has(p.id) && !before.has(p.id)).map((p) => permName(p.id));
              const removed = PERMISSIONS.filter((p) => before.has(p.id) && !granted.has(p.id)).map((p) => permName(p.id));
              const list = (names: string[]) => (
                <ul className="flex flex-col gap-0.5">
                  {names.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              );
              const details: [string, ReactNode][] = [[st.roleName, name || "-"]];
              if (role && role.name !== name) details[0] = [st.roleName, `${role.name} → ${name || "-"}`];
              if (!role) details.push([k.permissions, list(added)]);
              else {
                if (added.length) details.push([k.permsAdded, list(added)]);
                if (removed.length) details.push([k.permsRemoved, list(removed)]);
              }
              const answer = await ask({
                title: k.saveRole,
                tone: added.length > 0 && role !== null ? "danger" : "default",
                details,
                note: role && role.members > 0 ? `${k.saveRoleNote} (${fmt(st.people, { n: role.members })})` : undefined,
              });
              if (answer.ok) run(() => saveRoleAction(role?.id ?? null, { name, description, permissions: [...granted] }), onClose);
            }}
          >
            {st.saveRole}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <Field label={st.roleName} htmlFor="role-name">
          <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={st.roleDesc} htmlFor="role-desc" optional>
          <Textarea id="role-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {GROUPS.map((group) => (
          <fieldset key={group} className="rounded-card border border-line p-3">
            <legend className="px-1 text-sm font-semibold text-ink">{t.admin.shell.permGroups[group]}</legend>
            <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-control px-2 py-2 hover:bg-panel">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-brand)]"
                      checked={granted.has(p.id)}
                      // Permissions the editor lacks cannot be handed out (the server refuses them too).
                      disabled={!canGrant(viewer.permissions, [p.id])}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="text-sm text-ink">
                      {t.admin.shell.perms[p.id] ?? p.id}
                      <span className="block font-mono text-[11px] text-ink-3">{p.id}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </Sheet>
  );
}
