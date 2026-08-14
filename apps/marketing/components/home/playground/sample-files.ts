/**
 * Two images generated in the browser, so the playground can open with files
 * already queued: the uploader's file rows, progress bars and Clear/Upload
 * buttons are most of the component, and an empty drop zone hides all of it
 * until the visitor thinks to drag something in.
 *
 * Generated rather than shipped as assets to keep them off the page's byte
 * budget, and deliberately different sizes so the simulated upload finishes at
 * visibly different moments.
 */

type Spec = {
  name: string;
  width: number;
  height: number;
  hue: number;
};

const SPECS: Spec[] = [
  { name: "landscape.jpg", width: 1280, height: 860, hue: 205 },
  { name: "product-shot.jpg", width: 720, height: 900, hue: 25 },
];

function draw({ width, height, hue }: Spec): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue} 70% 62%)`);
  gradient.addColorStop(1, `hsl(${(hue + 45) % 360} 65% 32%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Grain, so the two compress to sizes far enough apart that the simulated
  // transfer times are visibly different rather than both rounding to instant.
  //
  // Drawn through a second canvas rather than putImageData: that call replaces
  // the pixels outright, alpha included, so writing translucent grey over the
  // gradient wipes it out and the JPEG comes back black.
  const noise = document.createElement("canvas");
  noise.width = Math.ceil(width / 2);
  noise.height = Math.ceil(height / 2);
  const noiseCtx = noise.getContext("2d");
  if (noiseCtx) {
    const pixels = noiseCtx.createImageData(noise.width, noise.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const v = Math.random() * 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
    noiseCtx.putImageData(pixels, 0, 0);

    ctx.globalAlpha = 0.16;
    ctx.drawImage(noise, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  return canvas;
}

function toFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) =>
        resolve(blob ? new File([blob], name, { type: "image/jpeg" }) : null),
      "image/jpeg",
      0.72,
    );
  });
}

export async function createSampleFiles(): Promise<File[]> {
  const files = await Promise.all(
    SPECS.map((spec) => toFile(draw(spec), spec.name)),
  );
  return files.filter((file): file is File => file !== null);
}
