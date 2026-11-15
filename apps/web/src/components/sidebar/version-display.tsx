"use client"

import { useEffect, useState } from "react";


/** The running version, read from /api/version (IMAGE_TAG, set at runtime). Null until known. */
export function useVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("latest"));
  }, []);

  return version;
}
