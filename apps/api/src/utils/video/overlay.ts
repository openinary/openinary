import { FullGravityMode } from "shared";
import sharp from "sharp";
import Ffmpeg, { FilterSpecification } from "fluent-ffmpeg";
import { promisify } from "util";
import fs from "fs/promises";
import logger from "utils/logger";
import { TransformFunction } from "./types";

/**
 * Apply resize transformation to a video
 * Supports multiple crop modes: fill, crop, fit, scale, pad
 */
export const applyOverlay: TransformFunction = async (
  command,
  outputVideoStream,
  context,
) => {
  const {
    width,
    height,
    overlayPath,
    overlayGravity,
    overlayHeight,
    overlayWidth,
    overlayOpacity,
    overlayTiled,
    overlayXOffset,
    overlayYOffset,
  } = context.params;

  // Skip if no valid dimensions
  if (!overlayPath) {
    return;
  }

  const ffprobe = promisify(Ffmpeg.ffprobe);

  try {
    const overlayImage = sharp(overlayPath);
    const overlayMetaData = await overlayImage.metadata();

    const videoMetaData = await ffprobe(context.inputPath);
    const video = videoMetaData?.streams?.find(
      (stream) => stream.codec_type === "video",
    );

    const watermarkWidth = overlayWidth || overlayMetaData.width;
    const watermarkHeight = overlayHeight || overlayMetaData.height;

    if (
      overlayTiled &&
      watermarkHeight &&
      watermarkWidth &&
      (width || video.width) &&
      (height || video.height)
    ) {
      const cols = Math.ceil((width || video.width) / watermarkWidth);
      const rows = Math.ceil((height || video.height) / watermarkHeight);

      const tiled = createTiledWatermarkFilters({
        videoWidth: width || video.width,
        videoHeight: height || video.height,
        watermarkWidth,
        watermarkHeight,
        previousOutputStream: outputVideoStream,
        opacity: overlayOpacity ? overlayOpacity / 100 : 0.5,
      });

      return {
        command: command.input(overlayPath),
        complexFilters: tiled.filters,
        outputVideoStream: tiled.output,
      };
    }

    const pos = overlayPosition(overlayGravity, overlayXOffset, overlayYOffset);

    return {
      command: command.input(overlayPath),
      complexFilters: [
        {
          filter: "scale",
          options: `${overlayWidth || -1}:${overlayHeight || -1}`,
          inputs: "1:v",
          outputs: "wm_scaled",
        },
        {
          filter: "format",
          options: "rgba",
          inputs: "wm_scaled",
          outputs: "wm_rgba",
        },
        {
          filter: "colorchannelmixer",
          options: `aa=${overlayOpacity ? overlayOpacity / 100 : 0.5}`,
          inputs: "wm_rgba",
          outputs: "wm_alpha",
        },
        {
          filter: "overlay",
          options: `${pos.x}:${pos.y}`,
          inputs: [outputVideoStream, "wm_alpha"],
          outputs: "wm_marked",
        },
      ],
      outputVideoStream: "wm_marked",
    };
  } catch (e) {
    console.log("overlay failed");
    logger.error(e);
    throw new Error("Adding overlay failed.");
  }
};

function overlayPosition(
  gravity: FullGravityMode | undefined,
  left = 0,
  top = 0,
) {
  switch (gravity) {
    case "northwest":
      return { x: `${left}`, y: `${top}` };

    case "north":
      return {
        x: `(main_w-overlay_w)/2+${left}`,
        y: `${top}`,
      };

    case "northeast":
      const filters = [];

      // Prepare the watermark
      filters.push(
        `[1:v]scale=${watermarkWidth}:${watermarkHeight},format=rgba,colorchannelmixer=aa=${opacity}[wm]`,
      );
      return {
        x: `main_w-overlay_w-${left}`,
        y: `${top}`,
      };

    case "west":
      return {
        x: `${left}`,
        y: `(main_h-overlay_h)/2+${top}`,
      };

    case "center":
      return {
        x: `(main_w-overlay_w)/2+${left}`,
        y: `(main_h-overlay_h)/2+${top}`,
      };

    case "east":
      return {
        x: `main_w-overlay_w-${left}`,
        y: `(main_h-overlay_h)/2+${top}`,
      };

    case "southwest":
      return {
        x: `${left}`,
        y: `main_h-overlay_h-${top}`,
      };

    case "south":
      return {
        x: `(main_w-overlay_w)/2+${left}`,
        y: `main_h-overlay_h-${top}`,
      };

    case "southeast":
    default:
      return {
        x: `main_w-overlay_w-${left}`,
        y: `main_h-overlay_h-${top}`,
      };
  }
}

function createTiledWatermarkFilters({
  videoWidth,
  videoHeight,
  watermarkWidth,
  watermarkHeight,
  previousOutputStream,
  spacingX = 0,
  spacingY = 0,
  offsetX = 0,
  offsetY = 0,
  opacity = 0.3,
  stagger = false,
}: {
  videoWidth: number;
  videoHeight: number;
  watermarkWidth: number;
  watermarkHeight: number;
  previousOutputStream: string;
  spacingX?: number;
  spacingY?: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  stagger?: boolean;
}): { filters: FilterSpecification[]; output: string } {
  const filters: FilterSpecification[] = [];

  // Prepare watermark once
  filters.push(
    {
      filter: "scale",
      options: `${watermarkWidth}:${watermarkHeight}`,
      inputs: "1:v",
      outputs: "wm_scaled",
    },
    {
      filter: "format",
      options: "rgba",
      inputs: "wm_scaled",
      outputs: "wm_rgba",
    },
    {
      filter: "colorchannelmixer",
      options: `aa=${opacity}`,
      inputs: "wm_rgba",
      outputs: "wm",
    },
  );

  const stepX = watermarkWidth + spacingX;
  const stepY = watermarkHeight + spacingY;

  let currentVideo = previousOutputStream;
  let overlayIndex = 0;

  for (let y = offsetY; y < videoHeight; y += stepY) {
    const rowOffset =
      stagger && ((y - offsetY) / stepY) % 2 === 1 ? stepX / 2 : 0;

    for (let x = offsetX + rowOffset; x < videoWidth; x += stepX) {
      const nextVideo = `video_${overlayIndex++}`;

      filters.push({
        filter: "overlay",
        inputs: [currentVideo, "wm"],
        options: {
          x: Math.round(x),
          y: Math.round(y),
        },
        outputs: nextVideo,
      });

      currentVideo = nextVideo;
    }
  }

  return {
    filters,
    output: currentVideo,
  };
}
