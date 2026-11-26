import { Hono, type Context } from "hono";
import { getDatabase } from "shared";
import { getAuth } from "shared/auth";
import { apiKeyAuth, AuthVariables, requirePermission } from "../middleware/auth";
import { logger, serializeError } from "@openinary/core";

/**
 * /api-keys, documented in apps/docs/api-reference/api-keys. Better Auth's own
 * /api-key/* endpoints need a session cookie; these also accept an API key.
 */
const apiKeys = new Hono<AuthVariables>();

apiKeys.use("/*", apiKeyAuth, requirePermission("apiKeys:manage"));

const serverError = (c: Context, error: unknown, message: string) => {
  logger.error({ error: serializeError(error), path: c.req.path }, message);
  return c.json(
    {
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    },
    500,
  );
};

const isoOrNull = (value: Date | string | number | null) =>
  value == null ? null : new Date(value).toISOString();

/** 404 or 403 unless `keyId` belongs to `userId`; null when it does. */
async function ownershipError(c: Context, keyId: string, userId: string, action: string) {
  const key = await (await getDatabase())
    .selectFrom("apiKey")
    .select("referenceId")
    .where("id", "=", keyId)
    .executeTakeFirst();
  if (!key) {
    return c.json({ error: "Not found", message: "API key not found" }, 404);
  }
  if (key.referenceId !== userId) {
    return c.json(
      {
        error: "Forbidden",
        message: `You don't have permission to ${action} this API key`,
      },
      403,
    );
  }
  return null;
}

apiKeys.post("/create", async (c) => {
  try {
    const { name, expiresIn } = await c.req.json();
    const userId = c.get("user")!.id;

    const result = await (await getAuth()).api.createApiKey({
      body: {
        name: name || "API Key",
        userId,
        expiresIn: expiresIn || 365 * 24 * 60 * 60,
      },
    });

    if (result && "key" in result) {
      return c.json({
        success: true,
        apiKey: {
          id: result.id,
          key: result.key,
          name: result.name,
          start: result.start,
          createdAt: result.createdAt,
          expiresAt: result.expiresAt,
        },
        message: "API key created successfully. Save this key - it will not be shown again!",
      });
    }

    return c.json(
      {
        error: "Failed to create API key",
        message: "An error occurred while creating the API key",
      },
      500,
    );
  } catch (error) {
    return serverError(c, error, "Error creating API key");
  }
});

apiKeys.get("/list", async (c) => {
  try {
    const rows = await (await getDatabase())
      .selectFrom("apiKey")
      .select([
        "id",
        "name",
        "start",
        "prefix",
        "enabled",
        "expiresAt",
        "createdAt",
        "updatedAt",
        "remaining",
        "rateLimitEnabled",
      ])
      .where("referenceId", "=", c.get("user")!.id)
      .orderBy("createdAt", "desc")
      .execute();
    // Same shape on both dialects: booleans (0/1 on SQLite) and ISO timestamps
    // (Dates on Postgres), as documented.
    const keys = rows.map((row) => ({
      ...row,
      enabled: !!row.enabled,
      rateLimitEnabled: !!row.rateLimitEnabled,
      expiresAt: isoOrNull(row.expiresAt),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    }));

    return c.json({ success: true, keys });
  } catch (error) {
    return serverError(c, error, "Error listing API keys");
  }
});

apiKeys.delete("/:keyId", async (c) => {
  const keyId = c.req.param("keyId");
  try {
    const denied = await ownershipError(c, keyId, c.get("user")!.id, "delete");
    if (denied) return denied;

    await (await getDatabase()).deleteFrom("apiKey").where("id", "=", keyId).execute();
    return c.json({ success: true, message: "API key deleted successfully" });
  } catch (error) {
    return serverError(c, error, "Error deleting API key");
  }
});

apiKeys.patch("/:keyId", async (c) => {
  const keyId = c.req.param("keyId");
  try {
    const { name, enabled } = await c.req.json();
    const userId = c.get("user")!.id;

    const denied = await ownershipError(c, keyId, userId, "update");
    if (denied) return denied;

    const result = await (await getAuth()).api.updateApiKey({
      body: { keyId, userId, name, enabled },
    });

    return c.json({
      success: true,
      key: result,
      message: "API key updated successfully",
    });
  } catch (error) {
    return serverError(c, error, "Error updating API key");
  }
});

export default apiKeys;
