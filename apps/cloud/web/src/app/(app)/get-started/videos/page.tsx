import { GetStartedPage } from "@/components/get-started/page-shell";
import { VideosPlayground } from "@/components/playground/videos-playground";

export default function Page() {
  return (
    <GetStartedPage
      title="Videos"
      heading="Optimize & deliver videos"
      description="The same URL grammar as images, plus a few keys of its own: trim a clip by seconds, pull a poster frame, or serve a lighter rendition to smaller screens."
    >
      <VideosPlayground />
    </GetStartedPage>
  );
}
