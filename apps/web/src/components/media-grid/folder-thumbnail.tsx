import { TRANSFORM_BASE_URL } from "./constants";
import { getFolderInitials } from "./utils";

interface FolderThumbnailProps {
  images: string[];
  folderName: string;
}

export function FolderThumbnail({ images, folderName }: FolderThumbnailProps) {
  if (images.length === 4) {
    return (
      <div className="grid grid-cols-2 gap-0.5 w-full h-full">
        {images.map((src, i) => (
          <div key={i} className="overflow-hidden">
            <img
              src={`${TRANSFORM_BASE_URL}/t/w_250,h_250,q_70/${src}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5 w-full h-full">
        <div className="overflow-hidden row-span-2">
          <img
            src={`${TRANSFORM_BASE_URL}/t/w_250,h_500,q_70/${images[0]}`}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        {images.slice(1).map((src, i) => (
          <div key={i} className="overflow-hidden">
            <img
              src={`${TRANSFORM_BASE_URL}/t/w_250,h_250,q_70/${src}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 w-full h-full">
        {images.map((src, i) => (
          <div key={i} className="overflow-hidden">
            <img
              src={`${TRANSFORM_BASE_URL}/t/w_250,h_500,q_70/${src}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <img
        src={`${TRANSFORM_BASE_URL}/t/w_500,h_500,q_70/${images[0]}`}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      <span className="text-muted-foreground text-2xl font-bold tracking-wide">
        {getFolderInitials(folderName)}
      </span>
    </div>
  );
}
