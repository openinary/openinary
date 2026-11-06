import sharp from "sharp";
import {
  FullGravityMode,
  ImageResizeTransformParams,
  OverlayTransformParams,
} from "../../types";
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

    // sharp ignores gravity once top/left are set, so lx_/ly_ are turned
    // into an absolute position measured from the lg_ anchor here. Tiles
    // keep passing them straight through, as before.
    const hasOffset =
      params.overlayXOffset != null && params.overlayYOffset != null;
    const placement =
      hasOffset && !params.overlayTiled
        ? overlayOffset(
            params.overlayGravity,
            baseInfo.width,
            baseInfo.height,
            width,
            height,
            params.overlayXOffset!,
            params.overlayYOffset!,
          )
        : {
            gravity: params.overlayGravity,
            top: params.overlayYOffset,
            left: params.overlayXOffset,
          };

    const output = await sharp(baseData)
      .composite([
        {
          input: tileBuffer,
          ...placement,
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

/**
 * Where an overlay with lx_/ly_ goes, as {left, top} from the top-left.
 * Same rules as the video path: the offsets push the overlay in from the
 * lg_ edge (lx_10 on east moves it 10px left of the right edge) and shift
 * it on a centred axis. Without lg_ they count from the top-left, which is
 * what image URLs have always done. The result is clamped so the overlay
 * stays inside the base, which sharp's composite requires.
 */
export const overlayOffset = (
  gravity: FullGravityMode | undefined,
  baseWidth: number,
  baseHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  x: number,
  y: number,
): { left: number; top: number } => {
  const g = gravity ?? FullGravityMode.NORTHWEST;
  const freeX = baseWidth - overlayWidth;
  const freeY = baseHeight - overlayHeight;

  const left =
    g === FullGravityMode.NORTHWEST ||
    g === FullGravityMode.WEST ||
    g === FullGravityMode.SOUTHWEST
      ? x
      : g === FullGravityMode.NORTHEAST ||
          g === FullGravityMode.EAST ||
          g === FullGravityMode.SOUTHEAST
        ? freeX - x
        : Math.round(freeX / 2) + x;

  const top =
    g === FullGravityMode.NORTHWEST ||
    g === FullGravityMode.NORTH ||
    g === FullGravityMode.NORTHEAST
      ? y
      : g === FullGravityMode.SOUTHWEST ||
          g === FullGravityMode.SOUTH ||
          g === FullGravityMode.SOUTHEAST
        ? freeY - y
        : Math.round(freeY / 2) + y;

  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));
  return { left: clamp(left, freeX), top: clamp(top, freeY) };
};
