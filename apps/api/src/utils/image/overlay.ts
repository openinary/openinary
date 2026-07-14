import fs from "fs/promises";
import sharp from "sharp";
import {
  ImageResizeTransformParams,
  OverlayTransformParams,
} from "shared/types";
import path from "path";
import { CloudStorage, createStorageClient } from "utils/storage";
import logger from "utils/logger";

/**
 * Apply overlay tranforms to Sharp image.
 */
export const applyOverlayImage = async (
  image: sharp.Sharp,
  params: OverlayTransformParams & ImageResizeTransformParams,
): Promise<sharp.Sharp> => {
  if (!params.overlayPath) return image;

  try {
    const overlayImage = sharp(params.overlayPath);
    const baseImageMetaData = await image.metadata();
    const overlayImageMetaData = await overlayImage.metadata();

    const overlayResizedBuffer = await overlayImage
      .resize({
        width: Math.min(
          params.width || baseImageMetaData.width || 0,
          params.overlayWidth || overlayImageMetaData.width || 0,
        ),
        height: Math.min(
          params.height || baseImageMetaData.height || 0,
          params.overlayHeight || overlayImageMetaData.height || 0,
        ),
      })
      .ensureAlpha(
        params.overlayOpacity != null ? params.overlayOpacity / 100 : 0.5,
      )
      .png()
      .toBuffer();

    const output = await image
      .composite([
        {
          input: overlayResizedBuffer,
          gravity: params.overlayGravity,
          top: params.overlayYOffset,
          left: params.overlayXOffset,
          tile: params.overlayTiled,
        },
      ])
      .png()
      .toBuffer();

    return sharp(output);
  } catch (e) {
    logger.error(e);
    throw new Error("Applying overlay to image failed.");
  }
};
