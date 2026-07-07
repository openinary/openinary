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
  const apiUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
  const cookie = request.headers.get("cookie") ?? "";

  const res = await fetch(`${apiUrl}/upload/sign`, {
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
