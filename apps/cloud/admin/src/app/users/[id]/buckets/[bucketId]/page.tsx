"use client";

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Fragment, Suspense } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { Empty, Freshness, LoadingRows } from "@/components/fields";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { adminFetch, adminUrl, orpc } from "@/utils/orpc";

/** GET /admin/users/:userId/buckets/:bucketId/storage - see worker/app.ts. */
type Level = {
  path: string;
  folders: { name: string; path: string }[];
  files: { name: string; path: string; size: number; mtime?: string }[];
};

// What a browser can draw by itself. psd is an image to the server but not
// to an <img>, so it falls through to the extension tile.
const IMAGE = /\.(jpe?g|png|webp|avif|gif)$/i;
const VIDEO = /\.(mp4|mov|webm)$/i;

const encodePath = (filePath: string) =>
  filePath.split("/").map(encodeURIComponent).join("/");

/**
 * One bucket, one directory level at a time, for moderation: the point is to
 * see at a glance what an account hosts, so files are a grid of previews, not
 * a table of names. The current folder lives in ?path= so the back button
 * walks back up.
 */
function Browser() {
  const params = useParams<{ id: string; bucketId: string }>();
  const userId = String(params.id);
  const bucketId = String(params.bucketId);
  const path = useSearchParams().get("path") ?? "";
  const queryClient = useQueryClient();

  const base = `/admin/users/${userId}/buckets/${bucketId}`;
  const levelQuery = (folderPath: string) => ({
    queryKey: ["admin", "storage", userId, bucketId, folderPath],
    queryFn: () =>
      adminFetch<Level>(
        `${base}/storage?path=${encodeURIComponent(folderPath)}`,
      ),
  });
  const { data, error, isFetching, dataUpdatedAt } = useQuery({
    ...levelQuery(path),
    // Stepping into a folder keeps the current one on screen, marked as
    // refreshing, rather than blanking the grid between levels.
    placeholderData: keepPreviousData,
  });

  // The fiche that linked here is already cached; it names the bucket and
  // the account.
  const { data: account } = useQuery(
    orpc.admin.get.queryOptions({ input: { userId } }),
  );
  const bucketName =
    account?.buckets.find((bucket) => bucket.id === bucketId)?.name ?? bucketId;

  const levelHref = (folderPath: string) =>
    `/users/${userId}/buckets/${bucketId}${
      folderPath ? `?path=${encodeURIComponent(folderPath)}` : ""
    }`;
  const fileUrl = (filePath: string, thumb = false) =>
    adminUrl(`${base}/file/${encodePath(filePath)}${thumb ? "?thumb=1" : ""}`);

  const remove = async (filePath: string) => {
    // The same takedown the Takedown page performs, by "{bucketId}/{path}"
    // reference - original, cached variants and the storage credit included.
    await adminFetch("/admin/asset", {
      method: "DELETE",
      body: JSON.stringify({ ref: `${bucketId}/${filePath}` }),
    });
    toast.success("Asset removed");
    queryClient.invalidateQueries({
      queryKey: ["admin", "storage", userId, bucketId],
    });
  };

  const segments = path ? path.split("/") : [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-lg">{bucketName}</h1>
          <p className="text-muted-foreground text-sm">
            <Link
              href={`/users/${userId}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {account?.user.email ?? userId}
            </Link>
          </p>
        </div>
        <Freshness isFetching={isFetching} updatedAt={dataUpdatedAt} />
      </header>

      <nav
        aria-label="Folder"
        className="flex flex-wrap items-center gap-1 text-sm"
      >
        <Crumb href={levelHref("")} current={!path}>
          {bucketName}
        </Crumb>
        {segments.map((segment, index) => {
          const folderPath = segments.slice(0, index + 1).join("/");
          return (
            <Fragment key={folderPath}>
              <span aria-hidden className="text-muted-foreground">
                /
              </span>
              <Crumb
                href={levelHref(folderPath)}
                current={index === segments.length - 1}
              >
                {segment}
              </Crumb>
            </Fragment>
          );
        })}
      </nav>

      {error && !data ? (
        <Empty>{error.message}</Empty>
      ) : !data ? (
        <LoadingRows rows={6} />
      ) : data.folders.length === 0 && data.files.length === 0 ? (
        <Empty>Empty folder.</Empty>
      ) : (
        <>
          {data.folders.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {data.folders.map((folder) => (
                <li key={folder.path}>
                  <Link
                    href={levelHref(folder.path)}
                    // Pointing at a folder is a good enough guess that it is
                    // about to be opened - same warm-up the user list does.
                    onMouseEnter={() =>
                      queryClient.prefetchQuery(levelQuery(folder.path))
                    }
                    onFocus={() =>
                      queryClient.prefetchQuery(levelQuery(folder.path))
                    }
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span aria-hidden>📁</span>
                    {folder.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {data.files.length > 0 ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
              {data.files.map((file) => (
                <li
                  key={file.path}
                  className="flex flex-col overflow-hidden rounded-md border bg-card"
                >
                  {/* Opens the original in a new tab - full size, whatever
                      the thumbnail hid. */}
                  <a
                    href={fileUrl(file.path)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex aspect-square items-center justify-center overflow-hidden bg-muted"
                  >
                    <Preview
                      name={file.name}
                      thumb={fileUrl(file.path, true)}
                      original={fileUrl(file.path)}
                    />
                  </a>
                  <div className="flex flex-col gap-1 p-2 text-xs">
                    <span className="truncate font-medium" title={file.name}>
                      {file.name}
                    </span>
                    <span className="truncate text-muted-foreground tabular-nums">
                      {formatBytes(file.size)}
                      {file.mtime ? ` · ${formatDate(file.mtime)}` : ""}
                    </span>
                    <div className="mt-1">
                      <ConfirmAction
                        label="Delete"
                        triggerVariant="destructive"
                        destructive
                        confirmWith={file.name}
                        title="Remove this asset?"
                        description={`Deletes ${file.name} from this bucket. There is no undo.`}
                        consequences={[
                          "The original file, so nothing can regenerate a derivative from it.",
                          "Every cached transform of it, whatever size or format was requested.",
                          "The freed storage is credited back to the account.",
                        ]}
                        confirmLabel="Delete asset"
                        onConfirm={() => remove(file.path)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

function Crumb({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "max-w-[12rem] truncate rounded px-1 hover:bg-muted",
        current ? "font-medium" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Images ask for the dashboard thumbnail (the server falls back to the
 * original when the customer's browser never generated one). Videos draw
 * their first frame straight off the original: a ranged metadata fetch, and
 * the only preview that is guaranteed to exist.
 *
 * ponytail: a folder of a thousand videos is a thousand ranged requests on
 * open. Serve the cached video thumbnail from the list route if that ever
 * hurts.
 */
function Preview({
  name,
  thumb,
  original,
}: {
  name: string;
  thumb: string;
  original: string;
}) {
  if (IMAGE.test(name))
    return (
      // next/image would fetch this through Next's optimizer, which has no
      // session cookie for the admin route. The server-side thumbnail is
      // already the optimisation.
      // biome-ignore lint/performance/noImgElement: cookie-gated source
      <img
        src={thumb}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
      />
    );
  if (VIDEO.test(name))
    return (
      <video
        src={original}
        preload="metadata"
        muted
        playsInline
        className="size-full object-cover"
      />
    );
  return (
    <span className="font-medium text-muted-foreground text-xs uppercase">
      {name.split(".").pop()}
    </span>
  );
}

// useSearchParams needs a Suspense boundary above it or the static build
// bails on the whole page.
export default function BucketPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <Browser />
    </Suspense>
  );
}
