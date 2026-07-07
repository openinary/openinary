import { NextResponse } from "next/server";

/**
 * Demo signing endpoint for the Openinary file uploader.
 *
 * Mirrors what a third-party consumer's backend would implement: it calls
 * `POST /upload/sign` on the Openinary API to mint a short-lived presigned
 * signature, and hands only that to the browser. A real consumer would
 * authenticate with an Openinary API key; since this demo lives inside the
 * Openinary dashboard itself, it forwards the current session cookie instead
 * (the API's /upload/sign endpoint accepts either).
 *
 * NOTE: this demo endpoint is intentionally unauthenticated beyond the
 * forwarded session. In a real app, protect it with your own auth and derive
 * `folder` from the authenticated user on the server — never trust a folder
 * sent by the browser.
 */
export async function POST(request: Request) {
  const configuredApiUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

  // In the combined "fullstack" Docker image, NEXT_PUBLIC_API_BASE_URL is a
  // relative path ("/api", see docker/full.Dockerfile) meant for same-origin
  // BROWSER calls proxied by nginx. For a server-side call, resolve it
  // against nginx's own loopback address instead — nginx, the API, and this
  // Next.js process all run in the same container (spawned together by
  // supervisord). Self-calling the public HTTPS hostname from inside the
  // container doesn't reliably round-trip through the platform's edge TLS
  // termination back to this same container (fails with a raw-HTTP-behind-TLS
  // error), so loopback + plain HTTP avoids that path entirely.
  const apiUrl = configuredApiUrl.startsWith("/")
    ? `http://127.0.0.1:3000${configuredApiUrl}`
    : configuredApiUrl;

  const cookie = request.headers.get("cookie") ?? "";

  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/upload/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({
      folder: "uploader-demo",
      expiresIn: 120,
    }),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    return NextResponse.json(
      { error: body?.error ?? "Failed to sign upload" },
      { status: res.status || 500 },
    );
  }

  return NextResponse.json({
    signature: body.signature,
    expires: body.expires,
    folder: body.folder,
  });
}
