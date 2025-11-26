import { Hono } from "hono";
import { auth } from "shared/auth";
import { apiKeyAuth, AuthVariables } from "../middleware/auth";
import logger from "../utils/logger";

const apiKeys = new Hono<AuthVariables>();

// Apply authentication middleware to all routes
apiKeys.use("/*", apiKeyAuth);

/**
 * Create a new API key
 * POST /api-keys/create
 */
apiKeys.post("/create", async (c) => {
  try {
    const body = await c.req.json();
    const { name, expiresIn } = body;

    // Get the authenticated user from context
    const user = c.get("user");

    if (!user?.id) {
      return c.json(
        {
          error: "Unauthorized",
          message: "User information not found in request",
        },
        401
      );
    }

    // Create the API key
    const result = await auth.api.createApiKey({
      body: {
        name: name || "API Key",
        userId: user.id,
        expiresIn: expiresIn || 365 * 24 * 60 * 60, // Default: 1 year in seconds
      },
    });

    if (result && "key" in result) {
      return c.json({
        success: true,
        apiKey: {
          id: result.id,
          key: result.key, // Only shown once!
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
      500
    );
  } catch (error) {
    logger.error({ error }, "Error creating API key");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * List all API keys for the authenticated user
 * GET /api-keys/list
 */
apiKeys.get("/list", async (c) => {
  try {
    const user = c.get("user");

    if (!user?.id) {
      return c.json(
        {
          error: "Unauthorized",
          message: "User information not found in request",
        },
        401
      );
    }

    // Get all API keys for this user
    const db = auth.options.database;
    const keys = db
      .prepare(
        `SELECT id, name, start, prefix, enabled, expiresAt, createdAt, updatedAt, remaining, rateLimitEnabled 
         FROM apiKey 
         WHERE userId = ? 
         ORDER BY createdAt DESC`
      )
      .all(user.id);

    return c.json({
      success: true,
      keys,
    });
  } catch (error) {
    logger.error({ error }, "Error listing API keys");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * Delete an API key
 * DELETE /api-keys/:keyId
 */
apiKeys.delete("/:keyId", async (c) => {
  try {
    const keyId = c.req.param("keyId");
    const user = c.get("user");

    if (!user?.id) {
      return c.json(
        {
          error: "Unauthorized",
          message: "User information not found in request",
        },
        401
      );
    }

    // Verify the key belongs to this user
    const db = auth.options.database;
    const key = db
      .prepare("SELECT userId FROM apiKey WHERE id = ?")
      .get(keyId) as { userId: string } | undefined;

    if (!key) {
      return c.json(
        {
          error: "Not found",
          message: "API key not found",
        },
        404
      );
    }

    if (key.userId !== user.id) {
      return c.json(
        {
          error: "Forbidden",
          message: "You don't have permission to delete this API key",
        },
        403
      );
    }

    // Delete the key
    await auth.api.deleteApiKey({
      body: {
        keyId,
      },
    });

    return c.json({
      success: true,
      message: "API key deleted successfully",
    });
  } catch (error) {
    logger.error({ error, keyId }, "Error deleting API key");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * Update an API key
 * PATCH /api-keys/:keyId
 */
apiKeys.patch("/:keyId", async (c) => {
  try {
    const keyId = c.req.param("keyId");
    const body = await c.req.json();
    const { name, enabled } = body;
    const user = c.get("user");

    if (!user?.id) {
      return c.json(
        {
          error: "Unauthorized",
          message: "User information not found in request",
        },
        401
      );
    }

    // Verify the key belongs to this user
    const db = auth.options.database;
    const key = db
      .prepare("SELECT userId FROM apiKey WHERE id = ?")
      .get(keyId) as { userId: string } | undefined;

    if (!key) {
      return c.json(
        {
          error: "Not found",
          message: "API key not found",
        },
        404
      );
    }

    if (key.userId !== user.id) {
      return c.json(
        {
          error: "Forbidden",
          message: "You don't have permission to update this API key",
        },
        403
      );
    }

    // Update the key
    const result = await auth.api.updateApiKey({
      body: {
        keyId,
        name,
        enabled,
      },
    });

    return c.json({
      success: true,
      key: result,
      message: "API key updated successfully",
    });
  } catch (error) {
    logger.error({ error, keyId }, "Error updating API key");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default apiKeys;

