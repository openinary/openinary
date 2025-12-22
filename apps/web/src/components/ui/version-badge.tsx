"use client";

import { useEffect, useState } from "react";

/**
 * Version badge component for unauthenticated pages (login, setup)
 * Displays the current version in the bottom-left corner
 */
export function VersionBadge() {
  const [version, setVersion] = useState<string>("latest");
  
  useEffect(() => {
    // Fetch IMAGE_TAG from API route (runtime value)
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("latest"));
  }, []);
  
  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className="px-3 py-1.5 text-xs text-muted-foreground/60 bg-background/80 backdrop-blur-sm rounded-md border border-border/40">
        Version: {version}
      </div>
    </div>
  );
}
