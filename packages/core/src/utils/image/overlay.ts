import sharp from "sharp";
import { ImageResizeTransformParams, OverlayTransformParams } from "../../types";
import logger from "../logger";

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
    const overlayImageMetaData = await overlayImage.metadata();
    // The base image's real size after resize: metadata() would report the
    // source's dimensions, and params.height is unset for a w_-only resize.
    const { data: baseData, info: baseInfo } = await image
      .png()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = overlaySize(
      overlayImageMetaData.width || 1,
      overlayImageMetaData.height || 1,
      baseInfo.width,
      baseInfo.height,
      params.overlayWidth,
      params.overlayHeight,
    );

    const overlayResizedBuffer = await overlayImage
      .resize({
        width,
        height,
        // overlaySize already settled the aspect ratio: never crop.
        fit: "fill",
      })
      .ensureAlpha()
      .composite([
        {
          input: {
            create: {
              width,
              height,
              channels: 4,
              background: {
                r: 255,
                g: 255,
                b: 255,
                alpha:
                  params.overlayOpacity != null
                    ? params.overlayOpacity / 100
                    : 0.5,
              },
            },
          },
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();

    // ls_: gap between tiles, as on video. Transparent padding to the right
    // of and below each tile does it, since sharp repeats the tile as is.
    const spacing = params.overlayTiled ? params.overlayTileSpacing ?? 0 : 0;
    const tileBuffer =
      spacing > 0
        ? await sharp(overlayResizedBuffer)
            .extend({
              right: spacing,
              bottom: spacing,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer()
        : overlayResizedBuffer;

    const output = await sharp(baseData)
      .composite([
        {
          input: tileBuffer,
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

/**
 * The overlay's drawn size, matching the video path (ffmpeg scale=W:-1):
 * lw_ or lh_ alone keeps the overlay's aspect ratio, both set an exact size,
 * neither keeps its own size. The result is then scaled down, aspect kept,
 * to fit inside the base image, which sharp's composite requires.
 *
 * Before this, a lone lw_ paired with the overlay's own height and sharp's
 * default "cover" fit cropped it: lw_80 on a 300x80 logo drew its middle
 * 80x80.
 */
export const overlaySize = (
  overlayWidth: number,
  overlayHeight: number,
  baseWidth: number,
  baseHeight: number,
  requestedWidth?: number,
  requestedHeight?: number,
): { width: number; height: number } => {
  let width = overlayWidth;
  let height = overlayHeight;
  if (requestedWidth && requestedHeight) {
    width = requestedWidth;
    height = requestedHeight;
  } else if (requestedWidth) {
    width = requestedWidth;
    height = (overlayHeight / overlayWidth) * requestedWidth;
  } else if (requestedHeight) {
    height = requestedHeight;
    width = (overlayWidth / overlayHeight) * requestedHeight;
  }
  const shrink = Math.min(1, baseWidth / width, baseHeight / height);
  return {
    width: Math.max(1, Math.round(width * shrink)),
    height: Math.max(1, Math.round(height * shrink)),
  };
};
