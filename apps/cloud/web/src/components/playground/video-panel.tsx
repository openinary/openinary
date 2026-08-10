/**
 * biome-ignore-all lint/performance/noImgElement: the extracted poster is a
 * blob: object URL from a canvas, which next/image cannot take, and the demo
 * posters are pre-encoded static files that re-optimising would only bloat.
 */
"use client";

import {
  CopyInput,
  formatFileSize,
  invalidateStorage,
  useOpeninary,
} from "@openinary/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  type DemoVideo,
  demoVideos,
  savingPercent,
} from "@/components/playground/demo-assets";
import { PATTERN_BASE, UrlPattern } from "@/components/playground/url-pattern";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  trackPlaygroundTransformApplied,
  trackPlaygroundUrlCopied,
} from "@/lib/analytics";
import { renderVideoPoster, type VideoPoster } from "@/lib/playground/render";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

const POSTER_AT_SECONDS = 5;

export function VideoPanel() {
  const [video, setVideo] = useState<DemoVideo | null>(demoVideos[0] ?? null);
  const [renditionId, setRenditionId] = useState<string | null>(null);
  const [own, setOwn] = useState<{
    file: File;
    poster: VideoPoster | null;
    path: string | null;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const posterUrl = useRef<string | null>(null);

  const { apiBaseUrl, fetch: fetchImpl } = useOpeninary();
  const queryClient = useQueryClient();
  const { data: buckets } = useQuery(orpc.bucket.list.queryOptions());
  const bucket = buckets?.find((b) => b.active) ?? buckets?.[0];
  const cdnBaseUrl = bucket
    ? `${process.env.NEXT_PUBLIC_SERVER_URL}/b/${bucket.id}`
    : "";

  useEffect(() => {
    return () => {
      if (posterUrl.current) URL.revokeObjectURL(posterUrl.current);
    };
  }, []);

  const rendition =
    video?.renditions.find((r) => r.id === renditionId) ?? video?.renditions[0];

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (posterUrl.current) URL.revokeObjectURL(posterUrl.current);
    posterUrl.current = null;
    setVideo(null);
    setOwn({ file, poster: null, path: null });
    setIsBusy(true);

    // Poster first: it needs nothing but the local file, so it lands long
    // before the upload does.
    try {
      const poster = await renderVideoPoster(file, POSTER_AT_SECONDS);
      if (poster) posterUrl.current = poster.url;
      setOwn((current) =>
        current?.file === file ? { ...current, poster } : current,
      );
    } catch {
      toast.error("Couldn't read a frame from that video.");
    }

    try {
      const body = new FormData();
      body.append("files", file);
      const response = await fetchImpl(`${apiBaseUrl}/upload`, {
        method: "POST",
        body,
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        files?: { path: string }[];
      };
      if (!data.success) throw new Error(data.error ?? "Upload failed");
      setOwn((current) =>
        current?.file === file
          ? { ...current, path: data.files?.[0]?.path ?? null }
          : current,
      );
      invalidateStorage(queryClient);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't add that video to your bucket",
      );
    } finally {
      setIsBusy(false);
    }
  };

  // Nothing picked and no demo media yet (the manifest ships empty until the
  // demo sources land) means there is no URL to show at all. And only an
  // uploaded file has one that resolves: the demo clips are served from /demo
  // and were never in the bucket, so those get the shape - see UrlPattern.
  //
  // tt_ gets the frame the browser actually decoded, not the one we asked for:
  // a clip shorter than POSTER_AT_SECONDS has no frame there, and ffmpeg's -ss
  // past the end encodes nothing, so the transform 500s.
  const posterAt = own?.poster?.atSeconds ?? POSTER_AT_SECONDS;
  const segment = own
    ? `t_true,tt_${posterAt},f_webp,w_1280`
    : rendition?.segment;
  const url =
    segment && own?.path ? `${cdnBaseUrl}/t/${segment}/${own.path}` : null;
  const pattern =
    segment && !own?.path ? `${PATTERN_BASE}/t/${segment}/{path}` : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="relative overflow-hidden rounded-md border bg-black">
          {video && rendition ? (
            <video
              // Keyed so switching rendition swaps the source instead of
              // leaving the old buffered stream playing.
              key={rendition.src}
              src={rendition.src}
              poster={video.poster}
              controls
              playsInline
              muted
              className="aspect-video w-full"
            >
              <track kind="captions" />
            </video>
          ) : own?.poster ? (
            <img
              src={own.poster.url}
              alt="Extracted frame"
              className="aspect-video w-full object-contain"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center text-muted-foreground text-xs">
              {isBusy ? <Spinner /> : "Pick a video below"}
            </div>
          )}

          {video && (
            <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-1">
              {video.renditions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setRenditionId(item.id);
                    trackPlaygroundTransformApplied({
                      surface: "videos",
                      op: "w",
                      value: String(item.width),
                      asset: "demo",
                    });
                  }}
                  className={cn(
                    "rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] shadow-sm backdrop-blur-sm transition-colors",
                    item.id === rendition?.id
                      ? "ring-1 ring-ring"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  {item.label} · {formatFileSize(item.bytes)}
                </button>
              ))}
            </div>
          )}
          {video && rendition && (
            <span className="absolute top-2 left-2 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] shadow-sm backdrop-blur-sm">
              source {formatFileSize(video.original.bytes)} ·{" "}
              {savingPercent(video.original.bytes, rendition.bytes)}% smaller
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {demoVideos.map((item) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => {
                setVideo(item);
                setRenditionId(null);
                setOwn(null);
              }}
              className={cn(
                "h-14 w-24 overflow-hidden rounded-md border transition-all",
                video?.slug === item.slug
                  ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              <img
                src={item.poster}
                alt={item.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            className={cn("h-14 flex-1 text-xs", own && "border-ring")}
            onClick={() => fileInput.current?.click()}
          >
            {isBusy ? (
              <Spinner className="size-4" />
            ) : (
              <FilePlus2 className="size-4" />
            )}
            Upload a video to your bucket
          </Button>
        </div>

        {own && (
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            That frame was decoded in your browser, which is why it was instant.
            Re-encoding a whole video is server work - upload it and Openinary
            handles it, rather than spending a minute of your CPU here.
          </p>
        )}
      </div>

      {(url || pattern) && (
        <div
          className="space-y-2"
          onCopyCapture={() =>
            trackPlaygroundUrlCopied({
              surface: "videos",
              op: own ? "poster" : "w",
              asset: own ? "own" : "demo",
            })
          }
        >
          {url && <CopyInput label="Poster frame URL" value={url} />}
          {pattern && (
            <UrlPattern
              label={own ? "Poster frame URL" : "Delivery URL"}
              pattern={pattern}
            />
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            {own ? (
              <>
                <span className="font-mono">t_true,tt_{posterAt}</span> takes a
                still {posterAt}s in; drop them and you get the video itself,
                resized.
              </>
            ) : (
              <>
                <span className="font-mono">so_</span> and{" "}
                <span className="font-mono">eo_</span> trim a clip by seconds,{" "}
                <span className="font-mono">t_true,tt_5</span> returns a poster
                frame instead of the video. That's the shape of the URL, not one
                to open - the demo clips aren't in your bucket.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
