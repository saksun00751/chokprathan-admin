import { Suspense } from "react";
import { RolesPanel, StaffTable } from "@/components/admin/staff-manager";
import { Table, Td, Th } from "@/components/admin/ui";
import { PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { formatDateTime } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getStaffPage } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.people.staff.title);

export default async function StaffPage() {
  const s = (await getI18n()).t.admin.people.staff;
  return (
    <>
      <PageHeader title={s.title} description={s.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const [{ viewer, staff, roles, logins }, { lang, t }] = await Promise.all([getStaffPage(), getI18n()]);
  const s = t.admin.people.staff;
  return (
    <div className="flex flex-col gap-10">
      <section>
        <StaffTable staff={staff} roles={roles} viewer={viewer} />
      </section>
      <section>
        <RolesPanel roles={roles} viewer={viewer} />
      </section>
      <section>
        <SectionTitle>{s.logins}</SectionTitle>
        <Table minWidth={640}>
          <thead>
            <tr>
              <Th>{s.time}</Th>
              <Th>{s.staffMember}</Th>
              <Th>{s.event}</Th>
              <Th>IP</Th>
              <Th>{s.device}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logins.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap">{formatDateTime(l.created_at, lang)}</Td>
                <Td>{l.name ?? l.identifier ?? "-"}</Td>
                <Td className={l.event.includes("failed") || l.event === "login_locked" ? "text-danger" : ""}>{s.events[l.event] ?? l.event}</Td>
                <Td className="tnum">{l.ip ?? "-"}</Td>
                <Td className="max-w-64 truncate text-xs text-ink-3" >{l.user_agent ?? "-"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
