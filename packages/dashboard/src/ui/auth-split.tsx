/** Night sky down to a blue horizon, the onboarding palette without the fade to the page. */
const SKY =
  "linear-gradient(180deg, #050b22 0%, #0a1846 28%, #1a49c4 62%, #3d7bf0 84%, #a9c6f8 100%)";

/**
 * The signed-out frame shared by self-hosted and Cloud: the form on the left,
 * a product shot over the sky on the right (large screens only). Each app
 * ships /auth-product.webp and /auth-product-dark.webp in its public folder.
 */
export function AuthSplit({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh bg-ds-panel text-ds-text">
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <div
        aria-hidden="true"
        className="relative m-2 hidden flex-1 overflow-hidden rounded-[16px] lg:block"
        style={{ backgroundImage: SKY }}
      >
        <img
          src="/auth-product.webp"
          alt=""
          className="absolute top-[12%] left-[14%] w-[1440px] max-w-none rounded-tl-[14px] shadow-[0_24px_80px_rgb(0_0_0/0.35)] ring-1 ring-white/20 dark:hidden"
        />
        <img
          src="/auth-product-dark.webp"
          alt=""
          className="absolute top-[12%] left-[14%] hidden w-[1440px] max-w-none rounded-tl-[14px] shadow-[0_24px_80px_rgb(0_0_0/0.5)] ring-1 ring-white/15 dark:block"
        />
      </div>
    </div>
  );
}
