---
name: openinary
description: Work with Openinary, open-source media storage and delivery (images and video, transformed on the fly from a URL). Use when the user wants to integrate Openinary uploads or delivery into a project, migrate a project from Cloudinary, or store, list, move, rename, delete or share files in their Openinary bucket.
---

# Openinary

Openinary stores files in the user's bucket and serves them from a URL, with
transformations (resize, crop, format, quality, video) written into the path.
Openinary Cloud runs at https://app.openinary.dev; it is also self-hostable.

## Ask before you build

Connecting Openinary is not a request to change the project. Unless the user
already said what they want, ask, and do only what they pick:

| They want to | Do this |
|---|---|
| Integrate Openinary into the project, or one part of it first | Read `references/integrate.md` and follow it, scoped to the part they named |
| Move a project off Cloudinary | Read `references/migrate-from-cloudinary.md` |
| Just store or share files from this chat | Use the MCP tools directly (below). No code changes |
| Something else | Check the docs index: https://openinary.dev/docs/llms.txt |

## This account's values

The guides use placeholders: `<API_HOST>`, `<DELIVERY_BASE>`, `<BUCKET_ID>`.
Get them from the Openinary MCP tool `get_account`. Without the MCP server,
the user finds them on the dashboard's Integrate page.

Self-hosted has no MCP server and no bucket id: `<API_HOST>` and
`<DELIVERY_BASE>` are both the server URL (e.g. `http://localhost:3000`),
uploads go to `<API_HOST>/upload` and delivery to `<API_HOST>/t/<path>`. The
guides' Cloud-only notes do not apply; check the docs when in doubt.

The API key (`OPENINARY_API_KEY`) is the one value only the user has. It is a
secret: the user creates it at https://app.openinary.dev/settings/api-keys and
writes it into the backend environment themselves. Never ask for it in chat,
never put it in client code or the repository.

## MCP tools

The Openinary MCP server (`https://cdn.openinary.dev/mcp`, OAuth sign-in in
the browser) acts on the bucket as the signed-in user:

- `get_account`: API host, bucket id, delivery base
- `list_files`, `get_file` (metadata and delivery URL, optionally transformed)
- `create_upload_url`: a short-lived signature, then POST multipart `signature`
  and `files` to the returned upload URL
- `create_folder`, `move`, `rename`, `delete` (asks before deleting)

## Delivery URLs

    <DELIVERY_BASE>/t/<path>                      the original, straight from storage
    <DELIVERY_BASE>/t/w_800,h_600,c_fill/<path>   a transformation

Store the path, never a full URL. A new transformation can answer
`202 {"status":"processing"}` on its first request while it is generated.
Transformation syntax: https://openinary.dev/docs/media-transformations/overview/index.md
