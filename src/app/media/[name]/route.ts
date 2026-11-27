import { connection } from "next/server";
import { cookies } from "next/headers";
import { can, EMPLOYEE_COOKIE, employeeFromToken } from "@/server/services/employee-auth";
import { isBrandFile, mayViewMedia } from "@/domain/media-access";
import { readImage } from "@/server/uploads";

/**
 * Uploaded images for the back office: transfer slips for employees who review deposits
 * (`finance.view`), banners for any signed-in employee (the public copy is served by the member site).
 * Brand images are open to everyone. Everything else, and anyone else, gets a 404.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[name]">) {
  await connection();
  const { name } = await params;
  const file = await readImage(name);
  if (!file) return new Response("Not found", { status: 404 });
  const token = (await cookies()).get(EMPLOYEE_COOKIE)?.value;
  const employee = token ? await employeeFromToken(token) : null;
  if (!mayViewMedia(name, file.kind, { signedIn: !!employee, finance: can(employee, "finance.view") })) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.type,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      "Cache-Control": isBrandFile(name, file.kind) ? "public, max-age=31536000, immutable" : "private, no-store",
    },
  });
}
