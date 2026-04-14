import { preloadMedia } from "@/hooks/use-preload-media";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { ITEM_CLASS, TRANSFORM_BASE_URL } from "./constants";
import { HoverLabel } from "./hover-label";
import type { MediaFile } from "./types";

interface MediaCardProps {
  media: MediaFile;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function MediaCard({
  media,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: MediaCardProps) {
  const thumbnailUrl =
    media.type === "image"
      ? `${TRANSFORM_BASE_URL}/t/w_500,h_500,q_80/${media.path}`
      : `${TRANSFORM_BASE_URL}/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${media.path}`;

  const handleMouseEnter = () => {
    const previewUrl =
      media.type === "image"
        ? `${TRANSFORM_BASE_URL}/t/w_500,h_500,q_80/${media.path}`
        : `${TRANSFORM_BASE_URL}/t/${media.path}`;
    preloadMedia(previewUrl, media.type);
    onMouseEnter();
  };

  return (
    <div
      className={ITEM_CLASS}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {media.type === "image" ? (
        <img
          src={thumbnailUrl}
          alt={media.name}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <VideoThumbnail
          src={thumbnailUrl}
          alt={media.name}
          className="transition-transform group-hover:scale-105"
          loading="lazy"
        />
      )}
      <HoverLabel name={media.name} visible={isHovered} />
    </div>
  );
}
