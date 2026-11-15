/**
 * Dev only: /docs is the docs site (apps/docs). Production serves it from its
 * own Worker on the route openinary.dev/docs*, so a request never gets here.
 * In dev this forwards it, path and query exactly as sent, to a local
 * production build of the docs (`pnpm --filter docs serve`, on :3335). A
 * next.config rewrite can't: it drops trailing slashes and rewrites queries.
 */
const DOCS_DEV_URL = process.env.DOCS_DEV_URL ?? "http://localhost:3335";

async function forward(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const upstream = await fetch(`${DOCS_DEV_URL}${url.pathname}${url.search}`, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });
  const headers = new Headers(upstream.headers);
  // The docs answer as their own origin; send redirects back through this one.
  const location = headers.get("location");
  if (location) headers.set("location", location.replace(DOCS_DEV_URL, url.origin));
  // fetch already decoded the body.
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export { forward as GET, forward as HEAD, forward as POST, forward as OPTIONS };
