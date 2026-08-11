import { GetStartedPage } from "@/components/get-started/page-shell";
import { ImagesPlayground } from "@/components/playground/images-playground";

export default function Page() {
  return (
    <GetStartedPage
      title="Images"
      heading="Optimize & deliver images"
      description="Every file you upload is served straight from the CDN. Add a transformation to the URL and Openinary resizes, crops and re-encodes it on the fly - no pre-generated variants to manage."
    >
      <ImagesPlayground />
    </GetStartedPage>
  );
}
