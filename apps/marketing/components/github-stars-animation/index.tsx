"use client";

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { motion, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { SlotText } from "slot-text/react";
import "slot-text/style.css";

const TRANSITION_DURATION = 0.3;
const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const;
const COUNTDOWN_DURATION = 2000;
const AVATAR_COUNT = 5;
const STAGGER_DELAY = 0.05;

// Module-level cache to persist across navigations
const dataCache = new Map<
  string,
  { starCount: number; stargazers: Stargazer[] }
>();
let countdownHasPlayed = false;

export type Stargazer = {
  login: string;
  avatar_url: string;
  html_url: string;
};

export type GitHubStarsAnimationProps = {
  owner?: string;
  repo?: string;
  stargazers?: Stargazer[];
  starCount?: number;
  apiEndpoint?: string;
  className?: string;
  avatarClassName?: string;
  countClassName?: string;
  showAvatars?: boolean;
  maxAvatars?: number;
};

export default function GitHubStarsAnimation({
  owner = "educlopez",
  repo = "smoothui",
  stargazers: providedStargazers,
  starCount: providedStarCount,
  apiEndpoint,
  className = "",
  avatarClassName = "",
  countClassName = "",
  showAvatars = true,
  maxAvatars = AVATAR_COUNT,
}: GitHubStarsAnimationProps) {
  const cacheKey = `${owner}/${repo}`;
  const cached = dataCache.get(cacheKey);
  const [stargazers, setStargazers] = useState<Stargazer[]>(
    cached?.stargazers || providedStargazers || [],
  );
  const [starCount, setStarCount] = useState(
    cached?.starCount ?? providedStarCount ?? 0,
  );
  const [displayCount, setDisplayCount] = useState(
    countdownHasPlayed ? (cached?.starCount ?? providedStarCount ?? 0) : 0,
  );
  const [isLoading, setIsLoading] = useState(!providedStargazers && !cached);
  const [error, setError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const countSpring = useSpring(0, {
    stiffness: 100,
    damping: 30,
  });

  // Fetch stargazers and star count
  useEffect(() => {
    if (providedStargazers && providedStarCount !== undefined) {
      setStargazers(providedStargazers.slice(-maxAvatars).reverse());
      setStarCount(providedStarCount);
      setIsLoading(false);
      return;
    }

    if (cached) {
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(false);

        // Try to fetch from custom API endpoint first
        if (apiEndpoint) {
          const response = await fetch(
            `${apiEndpoint}?owner=${owner}&repo=${repo}`,
          );
          if (response.ok) {
            const data = await response.json();
            if (data.stargazers) {
              setStargazers(data.stargazers.slice(-maxAvatars).reverse());
            }
            if (data.stars !== undefined) {
              setStarCount(data.stars);
            }
            setIsLoading(false);
            return;
          }
        }

        // Fallback to GitHub API directly (client-side)
        // Note: This has rate limits, so using a token is recommended
        const headers: HeadersInit = {
          Accept: "application/vnd.github.v3+json",
        };

        // Fetch repo info for star count
        let totalStars = 0;
        try {
          const repoResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            { headers },
          );

          if (repoResponse.ok) {
            const repoData = await repoResponse.json();
            totalStars = repoData.stargazers_count || 0;
            setStarCount(totalStars);
          }
        } catch {
          // Silently fail for star count
        }

        // Fetch stargazers - get the last page to show most recent stargazers
        try {
          // Calculate which page contains the last stargazers
          // GitHub API returns max 100 per page, so we fetch the last page
          const perPage = 100;
          const lastPage = totalStars > 0 ? Math.ceil(totalStars / perPage) : 1;

          const stargazersResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/stargazers?per_page=${perPage}&page=${lastPage}`,
            { headers },
          );

          if (stargazersResponse.ok) {
            const stargazersData =
              (await stargazersResponse.json()) as Stargazer[];
            // Take the last maxAvatars from the last page and reverse to show most recent first
            setStargazers(stargazersData.slice(-maxAvatars).reverse());
          }
        } catch {
          // Silently fail for stargazers
        }
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [
    owner,
    repo,
    apiEndpoint,
    maxAvatars,
    providedStargazers,
    providedStarCount,
    cached,
  ]);

  // Animate countdown
  useEffect(() => {
    if (starCount === 0) {
      return;
    }

    // Cache data for future mounts
    dataCache.set(cacheKey, { starCount, stargazers });

    if (countdownHasPlayed) {
      setDisplayCount(starCount);
      countSpring.set(starCount);
      return;
    }

    const startTime = Date.now();
    const startValue = 0;
    const endValue = starCount;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / COUNTDOWN_DURATION, 1);

      // Ease-out function
      const eased = 1 - (1 - progress) ** 3;
      const current = Math.floor(startValue + (endValue - startValue) * eased);

      setDisplayCount(current);
      countSpring.set(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayCount(endValue);
        countSpring.set(endValue);
        countdownHasPlayed = true;
      }
    };

    animate();
  }, [starCount, countSpring, cacheKey, stargazers]);

  if (isLoading) {
    return (
      <div
        className={cn("flex items-center gap-3 text-foreground/60", className)}
      >
        <div className="h-10 w-10 animate-pulse rounded-0 bg-foreground/20" />
        <div className="h-6 w-20 animate-pulse rounded-0 bg-foreground/20" />
      </div>
    );
  }

  if (error && starCount === 0) {
    return null;
  }

  const visibleAvatars = stargazers;

  const repoUrl = `https://github.com/${owner}/${repo}`;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Avatars */}
      {showAvatars && visibleAvatars.length > 0 && (
        <div className="relative flex items-center">
          {visibleAvatars.map((stargazer, index) => (
            <motion.a
              animate={{
                opacity: 1,
                scale: 1,
                x: 0,
              }}
              aria-label={`View ${owner}/${repo} on GitHub`}
              className={cn(
                "relative z-10 h-10 w-10 overflow-hidden rounded-full border-2 border-background bg-background transition-transform hover:z-20 hover:scale-110",
                avatarClassName,
              )}
              href={repoUrl}
              initial={{
                opacity: 0,
                scale: 0.8,
                x: -20,
              }}
              key={stargazer.login}
              rel="noopener noreferrer"
              style={{
                marginLeft: index > 0 ? "-8px" : "0",
              }}
              target="_blank"
              transition={{
                duration: TRANSITION_DURATION,
                delay: index * STAGGER_DELAY,
                ease: EASE_OUT_CUBIC,
              }}
              whileHover={{ scale: 1.1, zIndex: 20 }}
            >
              {/* biome-ignore lint/performance/noImgElement: Using img for user avatars without Next.js Image optimizations */}
              <img
                alt={`${stargazer.login}'s avatar`}
                className="h-full w-full object-cover"
                width={40}
                height={40}
                loading="lazy"
                src={`${stargazer.avatar_url}${stargazer.avatar_url.includes("?") ? "&" : "?"}s=80`}
              />
            </motion.a>
          ))}
        </div>
      )}

      {/* Star count */}
      <motion.a
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Star ${owner}/${repo} on GitHub`}
        animate={{
          opacity: 1,
          scale: 1,
        }}
        className={cn(
          "flex items-center gap-1.5 font-medium cursor-pointer",
          countClassName,
        )}
        initial={{
          opacity: 0,
          scale: 0.9,
        }}
        transition={{
          duration: TRANSITION_DURATION,
          ease: EASE_OUT_CUBIC,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Star className="h-4 w-4 fill-current" />
        <span className="tabular-nums">
          <SlotText
            text={(isHovered ? displayCount + 1 : displayCount).toLocaleString()}
            options={{ direction: isHovered ? "up" : "down" }}
          />
        </span>
        <span className="text-foreground/70 text-sm">
          {(isHovered ? displayCount + 1 : displayCount) === 1
            ? "star"
            : "stars"}
        </span>
      </motion.a>

      {/* Reduced motion fallback */}
      <style>
        {`
          @media (prefers-reduced-motion: reduce) {
            * {
              animation: none !important;
              transition: opacity 0.2s ease !important;
            }
          }
        `}
      </style>
    </div>
  );
}
