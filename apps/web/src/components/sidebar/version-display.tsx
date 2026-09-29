"use client"

import { useEffect, useState } from "react";

export function VersionDisplay() {
  const [version, setVersion] = useState<string>("latest");
  
  useEffect(() => {
    // Fetch IMAGE_TAG from API route (runtime value)
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("latest"));
  }, []);
  
  return (
    <span className="shrink-0 pr-1 text-xs text-muted-foreground tabular-nums">
      {version}
    </span>
  );
}
