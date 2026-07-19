# @openinary/ui

Openinary's dashboard UI components, hooks, and design primitives as a
standalone, embeddable React package. Extracted from `apps/web` so the
dashboard design can be reused outside this monorepo (e.g. in a closed-source
SaaS built on top of Openinary).

## Install

```bash
npm install @openinary/ui
```

Peer dependencies (install alongside, matching versions your app already uses):

```bash
npm install react react-dom @tanstack/react-query sonner
```

`react-query` and `sonner` must be **peers, not just installed anywhere in the
tree** — components read from your app's `QueryClientProvider` and `<Toaster />`
by identity. If a different copy of either package gets resolved for this
package, queries silently miss the client and toasts silently never render.

## Setup

Wrap your app in `OpeninaryProvider`, inside your existing `QueryClientProvider`.
This package does not create its own `QueryClient` — it uses whichever one is
already above it in the tree, so upload/delete/create mutations that call
`invalidateStorage(queryClient)` invalidate the same cache your own queries
read from.

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { OpeninaryProvider, Toaster } from "@openinary/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <OpeninaryProvider apiBaseUrl="https://media.example.com/api">
        {children}
        <Toaster />
      </OpeninaryProvider>
    </QueryClientProvider>
  );
}
```

`OpeninaryProvider` is a client component. If you render it from a Next.js
Server Component (e.g. a root `layout.tsx`), only pass serializable props —
strings are fine, but a custom `fetch` override is a function and can't cross
the RSC boundary. If you need a custom `fetch` (auth headers, retries,
tracing), render `OpeninaryProvider` from your own `"use client"` wrapper
instead of a Server Component.

## Tailwind

Components use Tailwind utility classes but ship no compiled CSS — your app's
Tailwind config already applies to them once it can see the class names. Add
an explicit `@source` so Tailwind's scanner doesn't skip `node_modules`:

```css
/* your globals.css, after @import "tailwindcss"; */
@source "../node_modules/@openinary/ui/dist";
```

(Path is relative to the CSS file — adjust the `../` depth for your project.)
Without this, every class this package uses gets purged from your build.

Theming is inherited, not duplicated: components resolve the same shadcn/ui
CSS variables (`--primary`, `--radius`, `--background`, …) your app already
defines. If your app follows the shadcn/ui neutral-palette convention, this
package's components render identically to your own.

## Two entry points

- `@openinary/ui` — the full client surface (components, hooks, provider).
  Carries a `"use client"` boundary; safe to import from Server Components,
  but the imported bindings are client references.
- `@openinary/ui/server` — pure, stateless exports only (types, `cn`,
  `getMediaType`, `formatFileSize`/`formatDate`/`getFileType`, `Spinner`). RSC
  Server Components can import from here directly without crossing a client
  boundary at all.

## What's included

The full media browser — `MediaGrid` (virtualized grid/list views, folder
navigation, context menus, bulk selection, drag-free move/copy/rename/delete)
plus its building blocks (dialogs, rename, upload, folder management, asset
details sidebar with transform-URL previews), the video processing queue UI,
the presigned-upload `FileUploader`, and the data hooks that back all of it
(`useStorageLevel`, `useQueueEvents`, `useVideoStatus`, …). All data hooks
read their API base URL from `OpeninaryProvider` context — nothing reads
`process.env` directly.

`MediaGrid` doesn't own folder navigation state — pass `folderPath` and
`onFolderPathChange` (or omit both to stay pinned to the root folder). This
keeps the package router-agnostic; wire it to your own URL state (nuqs,
React Router, etc.) the same way you already do for `AssetDetailsSidebar`'s
`assetId`/`onAssetIdChange`.

Also included: a composable `SettingsDialog` shell (nav sidebar + content
pane layout, no tab state or tab content of its own — you pass `nav`,
`tab`/`onTabChange`, and `children`) plus two ready-made tabs, `AppearanceTab`
(theme switcher, hide-thumbnails toggle) and `StorageTab` (usage stats, clear
cache). `AppearanceTab` needs a `next-themes` `ThemeProvider` above it in the
tree (`next-themes` is a peer dependency, same reasoning as `react-query`).

`Toaster` is Openinary's themed `sonner` wrapper (dark, pill-shaped toasts,
custom action/cancel/close styling) — render it instead of importing
`Toaster` from `sonner` directly, so toasts look the same as the dashboard.

**Not included**, by design — these are coupled to Openinary's self-hosted,
single-admin auth model and don't generalize to other apps' auth:
authentication UI (login/API-key management) and anything importing
`better-auth`.
