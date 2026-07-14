import { FullGravityMode } from "shared";
import sharp from "sharp";
import Ffmpeg, { FilterSpecification } from "fluent-ffmpeg";
import { promisify } from "util";
import fs from "fs/promises";
import logger from "utils/logger";
import { TransformFunction } from "./types";
import path from "path";
import { cleanupTempFile } from "routes/transform-helpers";

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
    overlayTileSpacing,
    overlayXOffset,
    overlayYOffset,
  } = context.params;

  // Skip if no valid dimensions
  if (!overlayPath) {
    return;
  }

  const ffprobe = promisify(Ffmpeg.ffprobe);

  try {
    const videoMetaData = await ffprobe(context.inputPath);
    const video = videoMetaData?.streams?.find(
      (stream) => stream.codec_type === "video",
    );

    if (overlayTiled && (width || video.width) && (height || video.height)) {
      const tiledWatermarkBuffer = await createTiledWatermark({
        watermarkFile: overlayPath,
        canvasWidth: width || video.width,
        canvasHeight: height || video.height,
        tileWidth: overlayWidth,
        tileHeight: overlayHeight,
        spacing: overlayTileSpacing,
        x: overlayXOffset,
        y: overlayYOffset,
      });

      const basepath = context.outputPath.replace(
        path.basename(context.outputPath),
        "",
      );
      const tempTiledWatermarkPath = path.join(
        basepath,
        `watermark-${crypto.randomUUID()}.png`,
      );

      try {
        await fs.writeFile(tempTiledWatermarkPath, tiledWatermarkBuffer);
      } catch {
        throw new Error("Saving temporary tiled watermark file failed.");
      }

      return {
        command: command.input(tempTiledWatermarkPath),
        complexFilters: [
          {
            filter: "format",
            options: "rgba",
            inputs: "1:v",
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
            options: `0:0`,
            inputs: [outputVideoStream, "wm_alpha"],
            outputs: "wm_marked",
          },
        ],
        outputVideoStream: "wm_marked",
        cleanupFunc: async () => {
          await cleanupTempFile(tempTiledWatermarkPath);
        },
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
      return {
        x: `main_w-overlay_w-${left}`,
        y: `${top}`,
      };

    case "west":
      return {
        x: `${left}`,
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
    case "center":
      return {
        x: `(main_w-overlay_w)/2+${left}`,
        y: `(main_h-overlay_h)/2+${top}`,
      };
  }
}

async function createTiledWatermark({
  watermarkFile,
  canvasWidth,
  canvasHeight,
  tileWidth,
  tileHeight,
  spacing = 0,
  x = 0,
  y = 0,
}: {
  watermarkFile: string;
  canvasWidth: number;
  canvasHeight: number;
  tileWidth?: number;
  tileHeight?: number;
  spacing?: number;
  x?: number;
  y?: number;
}): Promise<Buffer<ArrayBufferLike>> {
  const watermark = await sharp(watermarkFile);

  const metadata = await watermark.metadata();

  if (!metadata || !metadata.height || !metadata.width)
    throw new Error("Processing tiled watermark failed.");

  const watermarkWidth =
    tileWidth ||
    (tileHeight
      ? Math.floor((tileHeight / metadata.height) * metadata.width)
      : metadata.width);
  const watermarkHeight =
    tileHeight ||
    (tileWidth
      ? Math.floor((tileWidth / metadata.width) * metadata.height)
      : metadata.height);

  const watermarkResized = await watermark
    .resize({
      width: watermarkWidth,
      height: watermarkHeight,
      fit: tileWidth && tileHeight ? "fill" : "inside",
    })
    .ensureAlpha()
    .modulate({
      brightness: 1,
    })
    .png()
    .toBuffer();

  const composites = [];

  for (let top = y; top < canvasHeight; top += watermarkHeight + spacing) {
    for (let left = x; left < canvasWidth; left += watermarkWidth + spacing) {
      composites.push({
        input: watermarkResized,
        left,
        top,
      });
    }
  }

  return await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
