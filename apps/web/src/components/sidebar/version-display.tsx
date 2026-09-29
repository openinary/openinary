"use client"

import { useEffect, useState } from "react";

export function useVersion() {
  const [version, setVersion] = useState<string>("latest");

  useEffect(() => {
    // Fetch IMAGE_TAG from API route (runtime value)
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("latest"));
  }, []);

  return version;
}
