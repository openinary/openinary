import { IntegratePanel } from "@/components/get-started/integrate-panel";
import { GetStartedPage } from "@/components/get-started/page-shell";

export default function Page() {
  return (
    <GetStartedPage
      title="Integrate"
      heading="Connect your app"
      description="Create an API key, then install the uploader and its secure signing route."
    >
      <IntegratePanel />
    </GetStartedPage>
  );
}
