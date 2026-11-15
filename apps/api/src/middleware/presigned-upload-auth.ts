import { Context, Next } from "hono";
import { AuthVariables, authenticateRequest } from "./auth";
import { verifyUploadSignature, logger, serializeError } from "@openinary/core";

/**
 * Lets POST /upload authenticate with an API key or session as usual, or with
 * a short-lived signature from POST /upload/sign. The signature is scoped to
 * one `folder` and expires, so it is safe to hand to an untrusted browser.
 */
export const presignedOrApiKeyAuth =
  (apiSecret: string | undefined) =>
  async (c: Context<AuthVariables>, next: Next) => {
    if (await authenticateRequest(c)) {
      await next();
      return;
    }

    if (apiSecret) {
      try {
        const formData = await c.req.formData();
        const signature = formData.get("signature");
        const expiresRaw = formData.get("expires");
        const folder = (formData.get("folder") as string | null) ?? "";

        if (typeof signature === "string" && typeof expiresRaw === "string") {
          const expires = Number(expiresRaw);

          if (verifyUploadSignature(signature, folder, expires, apiSecret)) {
            if (Math.floor(Date.now() / 1000) > expires) {
              return c.json(
                { success: false, error: "Presigned upload URL has expired" },
                401,
              );
            }

            c.set("user", null);
            c.set("apiKey", null);
            await next();
            return;
          }
        }
      } catch (error) {
        logger.error(
          { error: serializeError(error) },
          "Error verifying presigned upload signature",
        );
      }
    }

    return c.json(
      {
        error: "Authentication required",
        message:
          "Please provide a valid API key (Authorization: Bearer <key>), valid session cookie, or a presigned upload signature",
      },
      401,
    );
  };
