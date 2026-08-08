import type { TransformFunction } from "./types";

/**
 * Apply resize transformation to a video
 * Supports multiple crop modes: fill, crop, fit, scale, pad
 */
export const applyResize: TransformFunction = (
  command,
  outputVideoStream,
  context,
) => {
  const { width, height, crop } = context.params;

  // One dimension is enough - see the scale filter below. Requiring both
  // meant w_303 alone fell through untouched: the video was still fully
  // re-encoded (minutes of container time, billed to the customer) and came
  // back at its original size, so the transform silently did nothing.
  const valid = (n: number | undefined): n is number =>
    n !== undefined && !isNaN(n) && n > 0;
  if (!valid(width) && !valid(height)) {
    return command;
  }

  // setsar=1 on every branch: ffmpeg's scale filter keeps the *display*
  // aspect ratio by rewriting the sample aspect ratio, so a source with a
  // non-square SAR came out with the requested pixel dimensions but was
  // still displayed at the original shape (w_300,h_300 on a 16:9 source
  // encoded 300x300 with SAR 16:9, i.e. a 533x300 picture in every player).
  // Cropping needs a box to crop to, so it still takes both dimensions;
  // with only one given, fall through to the plain scale below.
  if ((crop === "fill" || crop === "crop") && valid(w) && valid(h)) {
    // Cover behavior (no stretching):
    // 1) scale until the smallest side reaches the target, preserving aspect ratio
    // 2) crop to exact WxH from the center

    //const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    //return { command: command.videoFilters(filter) };
    return {
      complexFilters: [
        {
          filter: "scale",
          options: `${width}:${height}:force_original_aspect_ratio=increase`,
          inputs: outputVideoStream,
          outputs: "scaled",
        },
        {
          filter: "crop",
          options: `${width}:${height}`,
          inputs: "scaled",
          outputs: "cropped",
        },
        {
          filter: "setsar",
          options: "1",
          inputs: "cropped",
          outputs: "resizesar",
        },
      ],

      outputVideoStream: "resizesar",
    };
  } else {
    // Backwards-compatible behavior: simple resize to exact dimensions,
    // which may stretch to fit
    // Dimensions rounded to multiples of 2, as .size() did - h264 refuses
    // odd ones. -2 for a side that wasn't asked for: ffmpeg derives it
    // from the source aspect ratio, already rounded to an even number.

    return {
      complexFilters: [
        {
          filter: "scale",
          options: `${width}:${height}`,
          inputs: outputVideoStream,
          outputs: "scaled",
        },
        {
          filter: "setsar",
          options: "1",
          inputs: "scaled",
          outputs: "resizesar",
        },
      ],
      outputVideoStream: "resizesar",
    };
  }
};
