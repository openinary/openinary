/**
 * A sample image generated in the browser, so the playground can open with a
 * file already queued: the uploader's file row, thumbnail, progress bar and
 * Clear/Upload actions are most of the component, and an empty drop zone hides
 * all of it until the visitor thinks to drag something in.
 *
 * Generated rather than shipped as an asset so it costs nothing to download,
 * and sized for the only place it is ever shown: a 40px thumbnail, so 96px
 * covers a 2x display and anything beyond that would be bytes nobody sees.
 */

const NAME = "landscape.jpg";
const SIZE = 96;
const HUE = 205;

function draw(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  gradient.addColorStop(0, `hsl(${HUE} 70% 62%)`);
  gradient.addColorStop(1, `hsl(${(HUE + 45) % 360} 65% 32%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);

  return canvas;
}

export async function createSampleFiles(): Promise<File[]> {
  const blob = await new Promise<Blob | null>((resolve) =>
    draw().toBlob(resolve, "image/jpeg", 0.9),
  );
  return blob ? [new File([blob], NAME, { type: "image/jpeg" })] : [];
}
