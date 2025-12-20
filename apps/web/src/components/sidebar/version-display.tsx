"use client"

import { useEffect, useState } from "react";

export function VersionDisplay() {
  const [version, setVersion] = useState<string>("dev");
  
  useEffect(() => {
    // Fetch IMAGE_TAG from API route (runtime value)
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("dev"));
  }, []);
  
  return (
    <div className="px-2 py-1 text-center text-[11px] text-muted-foreground opacity-75">
      Version v{version}
    </div>
  );
}
