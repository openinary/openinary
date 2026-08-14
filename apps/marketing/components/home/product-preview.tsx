import Image from "next/image";

/**
 * Full-bleed product shot, exported flat from the Figma frame: the painted
 * backdrop and the dashboard are baked into one file rather than stacked at
 * runtime, so there is no inset to keep in step across breakpoints.
 *
 * This is where the product video goes once it exists.
 */
export function ProductPreview() {
  return (
    <section>
      <Image
        src="/product/preview.webp"
        alt="The Openinary dashboard listing images and videos in a bucket"
        width={2196}
        height={1698}
        sizes="(max-width: 1100px) 100vw, 1100px"
        priority
        className="h-auto w-full"
      />
    </section>
  );
}
