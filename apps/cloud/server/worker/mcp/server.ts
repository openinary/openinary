// The Openinary MCP server: POST /mcp, for coding agents (Claude Code, Cursor,
// Codex...). Loaded on the first /mcp request only, like the auth instance, so
// none of it counts against the Worker's startup budget.
//
// Every media tool is a thin call into the routes the dashboard and the API
// already use, made in-process with the agent's own OAuth token: that token is
// accepted by applySessionTenant (routes/tenant.ts), so permissions, metering
// and cache purges are exactly the ones a dashboard session gets.

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { aiPrompt } from "../../shared/ai-prompt.js";
import { AUTH_URL, DASHBOARD_ORIGIN } from "../config.js";
import { activeBucketFor, resolveAccount } from "../lib/account.js";
import type { App, Ctx } from "../routes/tenant.js";
import { verifyMcpRequest } from "./token.js";

const DOCS = "https://openinary.dev/docs";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const text = (value: unknown, isError = false): ToolResult => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
  ...(isError && { isError }),
});

/** A storage path as URL segments, so names with spaces or # survive. */
const encodePath = (path: string) =>
  path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");

const pathArg = z
  .string()
  .min(1)
  .describe('Path inside the bucket, e.g. "products/shoe.jpg"');

export async function handleMcp(c: Ctx, app: App): Promise<Response> {
  const verified = await verifyMcpRequest(c.req.raw);
  if ("challenge" in verified) return verified.challenge;

  const account = await resolveAccount({
    user: { id: verified.claims.sub },
    session: { activeOrganizationId: verified.claims.org },
  });
  const bucketId = await activeBucketFor(account);
  const deliveryBase = `${AUTH_URL}/b/${bucketId}`;
  const authorization = c.req.header("Authorization") ?? "";

  /** One of this Worker's own routes, as this agent. */
  const call = async (
    path: string,
    init: { method?: string; json?: unknown; form?: FormData } = {},
  ): Promise<ToolResult> => {
    const headers = new Headers({ Authorization: authorization });
    let body: BodyInit | undefined;
    if (init.form) body = init.form;
    else if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    const response = await app.fetch(
      new Request(new URL(path, AUTH_URL), {
        method: init.method ?? "GET",
        headers,
        body,
      }),
      c.env,
      c.executionCtx,
    );
    const payload = await response.json().catch(() => ({}));
    return text(payload, !response.ok);
  };

  const factory = () => {
    const server = new McpServer({ name: "openinary", version: "1.0.0" });

    server.registerTool(
      "setup_project",
      {
        title: "Set up Openinary in this project",
        description:
          "Step-by-step instructions to add Openinary uploads and media delivery to the project you are working in, prefilled with this account's bucket and URLs. Call this first when the user asks to set up or integrate Openinary, then follow what it returns.",
        annotations: { readOnlyHint: true },
      },
      async () =>
        text(
          `${aiPrompt({ apiBaseUrl: AUTH_URL, deliveryBase, bucketId })}
## Keys

The user creates OPENINARY_API_KEY at ${DASHBOARD_ORIGIN}/settings/api-keys
and writes it into the backend environment themselves. Never ask for it in
this chat, and never create one through any tool.`,
        ),
    );

    server.registerTool(
      "migrate_from_cloudinary",
      {
        title: "Migrate this project from Cloudinary",
        description:
          "Instructions to move a project that uses Cloudinary over to Openinary: how URLs and transformations map, and how to copy existing assets. Call this instead of setup_project when the project already uses Cloudinary.",
        annotations: { readOnlyHint: true },
      },
      async () =>
        text(`# Migrate from Cloudinary to Openinary

Read the full guide first: ${DOCS}/migrate-from-cloudinary.md
(page index: ${DOCS}/llms.txt)

This account's values:
- API host:  ${AUTH_URL}
- Delivery:  ${deliveryBase}/t/{transformations}/{path}
- Bucket id: ${bucketId}

1. Inventory: find every Cloudinary URL builder, SDK call and upload widget in
   the repository, and report them to the user before changing anything.
2. Copy assets: for each original the project needs, upload it with
   create_upload_url (one signature per folder), keeping the same path so the
   rewritten URLs line up. Check the result with list_files.
3. Rewrite delivery URLs with the mapping in the guide. Transformations go in
   the /t/ segment; a bare /t/<path> serves the original.
4. Replace the upload flow with the one setup_project describes.
5. Remove the Cloudinary SDK and its environment variables only once every
   reference is gone, and tell the user which ones to delete from their
   hosting provider.`),
    );

    server.registerTool(
      "list_files",
      {
        title: "List files",
        description:
          "Files and folders at one level of the bucket. Omit path for the root.",
        inputSchema: z.object({
          path: z
            .string()
            .optional()
            .describe('Folder to list, e.g. "products"'),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ path }) =>
        call(`/storage?path=${encodeURIComponent(path ?? "")}`),
    );

    server.registerTool(
      "get_file",
      {
        title: "Get a file and its URL",
        description:
          'A file\'s metadata and its public delivery URL. Pass transformations (e.g. "w_800,h_600,c_fill,f_webp") to get a transformed URL; the first request for a new transformation may answer 202 while it is generated.',
        inputSchema: z.object({
          path: pathArg,
          transformations: z
            .string()
            .optional()
            .describe("Transformation segment, without slashes"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ path, transformations }) => {
        const meta = await call(`/storage/${encodePath(path)}/metadata`);
        if (meta.isError) return meta;
        const t = transformations?.replace(/^\/+|\/+$/g, "");
        const url = `${deliveryBase}/t/${t ? `${t}/` : ""}${encodePath(path)}`;
        return text({ url, metadata: JSON.parse(meta.content[0].text) });
      },
    );

    server.registerTool(
      "create_upload_url",
      {
        title: "Get an upload signature",
        description:
          "A short-lived signature to upload files into one folder. Then POST multipart/form-data to the returned uploadUrl with fields `signature` and one or more `files` (e.g. curl -F signature=... -F files=@./photo.jpg). The response lists each stored path.",
        inputSchema: z.object({
          folder: z
            .string()
            .optional()
            .describe("Target folder; root when omitted"),
          expiresIn: z
            .number()
            .int()
            .min(1)
            .max(3600)
            .optional()
            .describe("Seconds the signature stays valid (default 300)"),
        }),
      },
      async ({ folder, expiresIn }) => {
        const signed = await call("/upload/sign", {
          method: "POST",
          json: { folder, expiresIn },
        });
        if (signed.isError) return signed;
        return text({
          uploadUrl: `${AUTH_URL}/upload`,
          ...JSON.parse(signed.content[0].text),
        });
      },
    );

    server.registerTool(
      "create_folder",
      {
        title: "Create a folder",
        description: "Creates an empty folder in the bucket.",
        inputSchema: z.object({ path: pathArg }),
      },
      async ({ path }) => {
        const form = new FormData();
        form.set("folder", path);
        return call("/upload/createfolder", { method: "POST", form });
      },
    );

    server.registerTool(
      "move",
      {
        title: "Move a file or folder",
        description:
          "Moves a file or a whole folder into another folder. Omit destination to move it to the root.",
        inputSchema: z.object({
          path: pathArg,
          destination: z.string().optional().describe("Target folder"),
        }),
      },
      async ({ path, destination }) =>
        call(`/storage/${encodePath(path)}/move`, {
          method: "POST",
          json: { destination: destination ?? "" },
        }),
    );

    server.registerTool(
      "rename",
      {
        title: "Rename a file or folder",
        description: "Renames in place, in the same folder.",
        inputSchema: z.object({
          path: pathArg,
          name: z.string().min(1).describe("New name, without slashes"),
        }),
      },
      async ({ path, name }) =>
        call(`/storage/${encodePath(path)}`, {
          method: "PATCH",
          json: { name },
        }),
    );

    server.registerTool(
      "delete",
      {
        title: "Delete a file or folder",
        description:
          "Permanently deletes a file, or a folder and everything in it, with all its cached transformations. This cannot be undone: confirm with the user first.",
        inputSchema: z.object({ path: pathArg }),
        annotations: { destructiveHint: true, idempotentHint: true },
      },
      async ({ path }) =>
        call(`/storage/${encodePath(path)}`, { method: "DELETE" }),
    );

    return server;
  };

  return createMcpHandler(factory).fetch(c.req.raw);
}
