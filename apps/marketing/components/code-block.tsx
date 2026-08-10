"use client";

import { cn } from "@/lib/utils";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { JSX, useLayoutEffect, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { BundledLanguage } from "shiki";

const highlightCache = new Map();

let shikiPromise: Promise<typeof import("shiki")> | null = null;

function getShiki() {
  if (!shikiPromise) {
    shikiPromise = import("shiki");
  }
  return shikiPromise;
}

export async function highlight(code: string, lang: BundledLanguage) {
  const cacheKey = `${lang}:${code.length}:${code.slice(0, 50)}:${code.slice(-50)}`;

  const cached = highlightCache.get(cacheKey);
  if (cached) return cached;

  const { codeToHast } = await getShiki();

  const hast = await codeToHast(code, {
    lang,
    themes: {
      light: "github-light",
      dark: "vesper",
    },
  });

  const result = toJsxRuntime(hast, {
    Fragment,
    jsx,
    jsxs,
  }) as JSX.Element;

  if (highlightCache.size > 100) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey) highlightCache.delete(firstKey);
  }
  highlightCache.set(cacheKey, result);

  return result;
}

type Props = {
  code: string | null;
  lang: BundledLanguage;
  initial?: JSX.Element;
  preHighlighted?: JSX.Element | null;
  maxHeight?: number;
  className?: string;
  theme?: string;
  lineNumbers?: boolean; // ← added
};

export default function CodeBlock({
  code,
  lang,
  initial,
  maxHeight = 940,
  preHighlighted,
  theme,
  className,
  lineNumbers,
}: Props) {
  const [content, setContent] = useState(preHighlighted || initial || null);

  useLayoutEffect(() => {
    if (preHighlighted) {
      return;
    }

    let isMounted = true;

    if (code) {
      highlight(code, lang).then((result) => {
        if (isMounted) setContent(result);
      });
    }

    return () => {
      isMounted = false;
    };
  }, [code, lang, theme, preHighlighted]);

  return content ? (
    <div
      className={cn(
        "max-h-(--pre-max-height) [&_pre]:overflow-x-auto [&_code]:text-[13px]/2 [&_code]:font-mono [&_pre]:border-l [&_pre]:p-2 [&_pre]:leading-snug",
        lineNumbers &&
          "[&_.line]:before:mr-4 [&_.line]:before:inline-block [&_.line]:before:w-4 [&_.line]:before:text-right [&_.line]:before:text-muted-foreground/50 [&_.line]:before:content-[counter(line)] [&_.line]:before:[counter-increment:line] [&_code]:[counter-reset:line]",
        className,
      )}
      style={{ "--pre-max-height": `${maxHeight}px` } as React.CSSProperties}
    >
      {content}
    </div>
  ) : (
    <pre className="rounded-lg p-4 text-xs">Loading...</pre>
  );
}
