import { type NextRequest, NextResponse } from "next/server";

// The gate. It runs before any page renders, so someone who is not the
// administrator never receives the panel's HTML - not the nav, not the route
// names, nothing. The oRPC procedures and /admin/* routes refuse them anyway,
// but "the data is safe" is not the same as "the door looks open".
//
// Authority stays on the server: this asks GET /admin/check, whose status code
// *is* the answer (see requireAdmin in the server's worker/app.ts). Deliberately
// not a local comparison against a copy of ADMIN_USER_ID - two sources of truth
// for who the admin is would drift, silently, and lock out the real one.

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

export async function middleware(request: NextRequest) {
  // Cookies are not port-scoped, and prod scopes the session to
  // ".openinary.dev", so the dashboard's cookie reaches this host in both
  // environments and can simply be forwarded.
  const cookie = request.headers.get("cookie") ?? "";

  let status: number;
  try {
    const response = await fetch(`${SERVER_URL}/admin/check`, {
      headers: { cookie },
      // The answer turns on a session that can be revoked; a cached 204 would
      // outlive the access it reports.
      cache: "no-store",
    });
    status = response.status;
  } catch {
    // The auth server being unreachable is not a reason to let someone in.
    status = 403;
  }

  if (status === 204) return NextResponse.next();

  // Not signed in at all: send them somewhere a sign-in can actually happen.
  // There is no form here - the session cookie is shared with the dashboard.
  if (status === 401 && process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.redirect(process.env.NEXT_PUBLIC_APP_URL);
  }

  return new NextResponse("Forbidden", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  // Everything except Next's own static output, which carries nothing
  // account-specific and would otherwise pay for a round trip per asset.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
