"use client";

import CodeBlock from "@/components/code-block";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { BundledLanguage } from "shiki";
import type { SVGProps } from "react";
import { NodeJs } from "@/components/ui/svgs/nodejs";
import { NextJs } from "@/components/ui/svgs/nextjs";
import { Remix } from "@/components/ui/svgs/remix";
import { Python } from "@/components/ui/svgs/python";
import { Go } from "@/components/ui/svgs/go";
import { Rust } from "@/components/ui/svgs/rust";

type CodeBlockType = "nodejs" | "nextjs" | "remix" | "python" | "go" | "rust";

export default function CodeBlockIllustration() {
  const [code, setCode] = useState<CodeBlockType>("nodejs");
  const nodejsRef = useRef<HTMLButtonElement>(null);
  const nextjsRef = useRef<HTMLButtonElement>(null);
  const remixRef = useRef<HTMLButtonElement>(null);
  const pythonRef = useRef<HTMLButtonElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const rustRef = useRef<HTMLButtonElement>(null);
  const [indicatorLeft, setIndicatorLeft] = useState(0);
  const [indicatorWidth, setIndicatorWidth] = useState(0);

  const iconMap: {
    [key in CodeBlockType]: React.ComponentType<SVGProps<SVGSVGElement>>;
  } = {
    nodejs: NodeJs,
    nextjs: NextJs,
    remix: Remix,
    python: Python,
    go: Go,
    rust: Rust,
  };

  const langMap: { [key in CodeBlockType]: BundledLanguage } = {
    nodejs: "typescript",
    nextjs: "tsx",
    remix: "tsx",
    python: "python",
    go: "go",
    rust: "rust",
  };

  const codeBlockConfigs = useMemo(
    () => [
      {
        name: "Node.js",
        value: "nodejs" as CodeBlockType,
        ref: nodejsRef,
      },
      {
        name: "Next.js",
        value: "nextjs" as CodeBlockType,
        ref: nextjsRef,
      },
      {
        name: "Remix",
        value: "remix" as CodeBlockType,
        ref: remixRef,
      },
      {
        name: "Python",
        value: "python" as CodeBlockType,
        ref: pythonRef,
      },
      {
        name: "Go",
        value: "go" as CodeBlockType,
        ref: goRef,
      },
      {
        name: "Rust",
        value: "rust" as CodeBlockType,
        ref: rustRef,
      },
    ],
    [],
  );

  useEffect(() => {
    const activeConfig = codeBlockConfigs.find(
      (config) => config.value === code,
    );
    const activeRef = activeConfig ? activeConfig.ref : nodejsRef;

    if (activeRef.current) {
      const parentElement = activeRef.current.parentElement;
      if (parentElement) {
        const parentLeft = parentElement.getBoundingClientRect().left;
        const buttonLeft = activeRef.current.getBoundingClientRect().left;
        const buttonWidth = activeRef.current.offsetWidth;

        const newIndicatorLeft = buttonLeft - parentLeft + 16;
        const newIndicatorWidth = buttonWidth;
        setIndicatorLeft(newIndicatorLeft);
        setIndicatorWidth(newIndicatorWidth);
      }
    }
  }, [code, codeBlockConfigs]);

  const codes: { [key in CodeBlockType]: string } = {
    nodejs: `// Cloudinary
// res.cloudinary.com/demo/image/upload/w_800,h_600,f_webp/photo.jpg

// Your instance — same syntax
const url = "https://your-instance.com/t/w_800,h_600,f_webp,q_80/photo.jpg";

const res = await fetch(url);`,
    nextjs: `// Cloudinary
// res.cloudinary.com/demo/image/upload/w_1200,h_630,c_fill/hero.jpg

// Your instance — same syntax
<Image
  src="https://your-instance.com/t/w_1200,h_630,c_fill,f_avif/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
/>`,
    remix: `// Cloudinary
// res.cloudinary.com/demo/image/upload/w_800,h_600,f_webp/photo.jpg

// Your instance — same syntax
const url = "https://your-instance.com/t/w_800,h_600,f_webp,q_80/photo.jpg";

export const loader = () => json({ url });`,
    python: `# Cloudinary
# res.cloudinary.com/demo/image/upload/w_800,h_600,f_webp/photo.jpg

# Your instance — same syntax
url = "https://your-instance.com/t/w_800,h_600,f_webp,q_80/photo.jpg"

res = requests.get(url)`,
    go: `// Cloudinary
// res.cloudinary.com/demo/image/upload/w_800,h_600,f_webp/photo.jpg

// Your instance — same syntax
url := "https://your-instance.com/t/w_800,h_600,f_webp,q_80/photo.jpg"

resp, _ := http.Get(url)
defer resp.Body.Close()`,
    rust: `// Cloudinary
// res.cloudinary.com/demo/image/upload/w_800,h_600,f_webp/photo.jpg

// Your instance — same syntax
let url = "https://your-instance.com/t/w_800,h_600,f_webp,q_80/photo.jpg";

let res = reqwest::get(url).await?;`,
  };

  const currentLang = langMap[code];

  return (
    <div className="bg-background relative z-10 max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border pt-6 shadow-lg shadow-black/5">
      <div className="relative z-10 px-3">
        <div className="flex gap-1.5 px-3">
          <div className="bg-muted-foreground/10 border-foreground/5 size-2 rounded-full border"></div>
          <div className="bg-muted-foreground/10 border-foreground/5 size-2 rounded-full border"></div>
          <div className="bg-muted-foreground/10 border-foreground/5 size-2 rounded-full border"></div>
        </div>

        <div className="relative mt-4 flex gap-1 overflow-x-auto">
          <motion.span
            animate={{ x: indicatorLeft, width: indicatorWidth }}
            layout
            transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
            className="bg-foreground/5 border-foreground/5 absolute inset-y-0 -left-4 flex rounded-full border"
          />

          {codeBlockConfigs.map(({ name, value, ref }) => {
            const IconComponent = iconMap[value];
            return (
              <button
                key={name}
                ref={ref}
                onClick={() => setCode(value)}
                data-state={code === value ? "active" : ""}
                className="data-[state=active]:text-foreground z-10 flex h-8 items-center gap-1.5 rounded-full px-3 text-sm duration-150 hover:opacity-50 data-[state=active]:hover:opacity-100"
              >
                {IconComponent && <IconComponent className="size-4 shrink-0" />}
                <span className="text-nowrap font-medium">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="h-76">
        <CodeBlock
          code={codes[code]}
          lang={currentLang}
          maxHeight={360}
          theme="github-light"
          lineNumbers
          className="[&_pre]:mask-b-from-85% [&_pre]:h-74 -mx-1 [&_pre]:min-h-[12rem] [&_pre]:rounded-xl [&_pre]:border-none [&_pre]:!bg-transparent [&_pre]:pt-4"
        />
      </div>
    </div>
  );
}
