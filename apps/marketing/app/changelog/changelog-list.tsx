"use client";

import { useState } from "react";

import { DOCS_URL, Pill, focusRing } from "@/components/site/ui";
import { cn } from "@/lib/utils";

export type Entry = { date: string; version: string; tags: string[]; body: string };

const filters = ["All updates", "Feature", "Improvement", "Fix", "Announcement"];

export function ChangelogList({ entries }: { entries: Entry[] }) {
  const [filter, setFilter] = useState(filters[0]);
  const shown = filter === filters[0] ? entries : entries.filter((e) => e.tags.includes(filter));

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-[0.5px] border-ink-4 pb-6">
        <div role="group" aria-label="Filter updates" className="flex flex-wrap gap-0.5 rounded-lg bg-well p-0.5 shadow-rule">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-7 rounded-md px-2.5 text-[12px] transition-colors",
                filter === f ? "bg-chip text-ink-12 shadow-rule-strong" : "text-ink-10 hover:text-ink-12",
                focusRing,
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <ol className="flex flex-col">
        {shown.map((e) => (
          <li key={`${e.date}-${e.version}`} className="border-b-[0.5px] border-ink-4 py-12">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-10">
              <time>{e.date}</time>
              {e.tags.map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </div>
            <h2 className="mt-3 text-[24px] leading-8 tracking-[-0.03em] text-ink-12">
              {e.version.startsWith("v") ? `Openinary ${e.version}` : e.version}
            </h2>
            <Markdown source={e.body} />
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * Just enough Markdown for the changelog: ## headings, lists, paragraphs,
 * bold, inline code and links. Relative links point into the docs.
 */
function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="mt-4 flex flex-col gap-4 text-[15px] leading-6 text-ink-11">
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) {
          return (
            <h3 key={i} className="mt-2 text-[15px] font-medium text-ink-12">
              {b.slice(3)}
            </h3>
          );
        }
        if (b.startsWith("- ")) {
          return (
            <ul key={i} className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-6">
              {b.split(/\n(?=- )/).map((li, j) => (
                <li key={j}>{inline(li.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = m.index;
    if (m[1]) out.push(<strong key={k} className="font-medium text-ink-12">{m[1]}</strong>);
    else if (m[2]) out.push(<code key={k} className="rounded bg-ink-3 px-1 py-0.5 font-mono text-[13px] text-ink-12">{m[2]}</code>);
    else {
      const href = m[4].startsWith("/") ? `${DOCS_URL}${m[4]}` : m[4];
      out.push(
        <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-ink-12 underline decoration-ink-6 underline-offset-4 hover:decoration-ink-11">
          {m[3]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
