import { splitTransformPath } from "@openinary/core/url/grammar";

export function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/** "w_500,f_auto/photos/a.jpg" -> the transformation and the file behind it. */
export function splitDelivery(path: string): { transform: string; file: string } {
  const { transform, filePath } = splitTransformPath(path);
  return { transform, file: filePath };
}
