import { GetStartedPage, IntegratePanel } from "@openinary/dashboard";

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
