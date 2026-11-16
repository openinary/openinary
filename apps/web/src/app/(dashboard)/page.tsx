import { AssetsView } from "@openinary/dashboard";
import { Suspense } from "react";

export default function HomePage() {
  return (
    <Suspense>
      <AssetsView />
    </Suspense>
  );
}
