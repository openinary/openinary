import Image from "next/image";

/**
 * Full-bleed product shot on the painted backdrop. The Figma frame holds the
 * dashboard at ~87% of the column width, so the insets are percentages and the
 * whole thing scales down to phone widths untouched.
 *
 * This is where the product video goes once it exists.
 */
export function ProductPreview() {
  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src="/product/backdrop.webp"
        alt=""
        aria-hidden
        fill
        sizes="100vw"
        priority
        className="-z-10 object-cover"
      />
      <div className="px-[6%] py-[7%]">
        <Image
          src="/product/dashboard.webp"
          alt="The Openinary dashboard listing images and videos in a bucket"
          width={1900}
          height={1343}
          sizes="(max-width: 1100px) 94vw, 1000px"
          priority
          className="h-auto w-full"
        />
      </div>
    </section>
  );
}
