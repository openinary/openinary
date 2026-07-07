/**
 * Server-side helper to mint a short-lived presigned upload signature for the
 * Openinary file uploader. Call this from your backend (route handler, server
 * action, Worker, etc.) using an Openinary API key, and hand the returned
 * signature to the browser component.
 *
 * This is a thin client for `POST /upload/sign`. Openinary itself computes
 * the HMAC signature — your backend never needs to hold `API_SECRET`, only an
 * API key (the same kind used for any other authenticated Openinary request).
 *
 * SECURITY: never call this endpoint, or expose your API key, from the
 * browser. Protect the route that calls this helper with your own auth and
 * rate limiting, and scope `folder` to the authenticated user server-side.
 */

export interface SignUploadOptions {
  /** Destination folder the signature will be scoped to. Defaults to the root. */
  folder?: string;
  /** Signature lifetime in seconds. The server clamps this to [1, 3600]. Default 300. */
  expiresIn?: number;
}

export interface SignedUpload {
  signature: string;
  /** Unix timestamp (seconds) after which the signature is no longer valid. */
  expires: number;
  folder: string;
}

/**
 * Requests a presigned upload signature from your Openinary instance.
 *
 * @param baseUrl Your Openinary API URL, e.g. https://media.example.com.
 * @param apiKey An Openinary API key (Authorization: Bearer).
 */
export async function signUpload(
  baseUrl: string,
  apiKey: string,
  options: SignUploadOptions = {},
): Promise<SignedUpload> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/upload/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(options),
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !body?.success) {
    throw new Error(body?.error ?? `Failed to sign upload (HTTP ${res.status})`);
  }

  return {
    signature: body.signature,
    expires: body.expires,
    folder: body.folder,
  };
}
