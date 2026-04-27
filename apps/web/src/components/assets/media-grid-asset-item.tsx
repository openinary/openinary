import { preloadMedia } from "@/hooks/use-preload-media";
import { cn } from "@/lib/utils";
import { VideoThumbnail } from "../video-thumbnail";
import ImageContextMenuWrapper from "./image-context-menu";
import { MediaFile } from "./media-grid";

export default function MediaGridAssetItem({
  media,
  ...props
}: {
  media: MediaFile;
  onClick: () => void;
}) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  // Use dedicated transform base URL (empty in Docker, falls back to apiBaseUrl without /api)
  const transformBaseUrl =
    process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL !== undefined
      ? process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL
      : apiBaseUrl.replace(/\/api$/, "");

  // For images: resize and optimize
  // For videos: extract thumbnail at 1 second as jpg image with crop mode to avoid stretching
  const thumbnailUrl =
    media.type === "image"
      ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
      : `${transformBaseUrl}/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${media.path}`;

  const handleMediaHover = () => {
    // For images: load the transformed image
    // For videos: preload the full video (not the thumbnail, which is already loaded)
    const previewUrl =
      media.type === "image"
        ? `${transformBaseUrl}/t/w_500,h_500,q_80/${media.path}`
        : `${transformBaseUrl}/t/${media.path}`;
    preloadMedia(previewUrl, media.type);
  };

  return (
    <ImageContextMenuWrapper assetId={media.id} onDetailsOpen={props.onClick}>
      <button
        className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/50 cursor-pointer transition-all group-hover:border-primary/30 group-hover:shadow-md group-focus:border-primary/30 group-focus:shadow-md"
        onMouseEnter={handleMediaHover}
        {...props}
      >
        {media.type === "image" ? (
          <img
            src={thumbnailUrl}
            alt={media.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105 group-focus:scale-105"
            loading="lazy"
          />
        ) : (
          <VideoThumbnail
            src={thumbnailUrl}
            alt={media.name}
            className="transition-transform group-hover:scale-105 group-focus:scale-105"
            loading="lazy"
          />
        )}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-2 transition-opacity",
            "opacity-0 group-hover:opacity-100 group-focus:opacity-100",
            "text-white text-xs font-semibold mt-auto py-3 truncate",
            "flex flex-col justify-end",
          )}
        >
          {media.name}
        </div>
      </button>
    </ImageContextMenuWrapper>
  );
}
