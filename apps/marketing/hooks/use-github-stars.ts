"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, number>();

export function useGitHubStars(owner: string, repo: string) {
  const key = `${owner}/${repo}`;
  const cached = cache.get(key) ?? null;
  const [starCount, setStarCount] = useState<number | null>(cached);
  const [isLoading, setIsLoading] = useState(cached === null);

  useEffect(() => {
    if (cache.has(key)) return;

    const fetchStars = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}`,
          {
            headers: {
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          const count = data.stargazers_count || 0;
          cache.set(key, count);
          setStarCount(count);
        }
      } catch (error) {
        console.error("Failed to fetch GitHub stars:", error);
        cache.set(key, 270);
        setStarCount(270);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStars();
  }, [owner, repo, key]);

  return { starCount, isLoading };
}
