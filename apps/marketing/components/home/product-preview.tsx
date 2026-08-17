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
        src="/product/preview.png"
        alt="The Openinary dashboard listing images and videos in a bucket"
        width={2196}
        height={1698}
        sizes="(max-width: 1100px) 100vw, 1100px"
        // next/image re-encodes on the way out and defaults to 75, which is
        // where the text in a UI shot starts to smear. The source is a
        // lossless PNG, so this is the only place quality is decided.
        quality={88}
        priority
        className="h-auto w-full"
      />
    </section>
  );
}
