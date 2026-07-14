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

  // Skip if no valid dimensions
  if (
    !width ||
    !height ||
    isNaN(width) ||
    isNaN(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return;
  }

  // Apply resize based on crop mode
  if (!crop || crop === "fill" || crop === "crop") {
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
      ],
      outputVideoStream: "cropped",
    };
  } else {
    // Backwards-compatible behavior: simple resize to exact dimensions,
    // which may stretch to fit

    //return { command: command.size(`${width}x${height}`) };
    return {
      complexFilters: [
        {
          filter: "scale",
          options: `${width}:${height}`,
          inputs: outputVideoStream,
          outputs: "scaled",
        },
      ],
      outputVideoStream: "scaled",
    };
  }
};
