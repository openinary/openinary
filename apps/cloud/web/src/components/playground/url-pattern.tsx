/**
 * A delivery URL with no file behind it. The demo media is served from /demo
 * and was never in anyone's bucket, so the URL we would print for it 404s -
 * printing it anyway just hands out a dead link with a copy button next to it.
 *
 * So: the shape, not the link. Deliberately not a CopyInput - there is nothing
 * here worth pasting, and `select-none` keeps it that way. `{braces}` mark the
 * parts the account supplies; everything between them is the real grammar.
 */

/** Stands in for the account's delivery base, `{apiBaseUrl}/b/{bucketId}`. */
export const PATTERN_BASE = "{delivery-url}";

export function UrlPattern({
  label,
  pattern,
}: {
  label: string;
  pattern: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm leading-none">{label}</p>
      <p className="select-none overflow-x-auto whitespace-nowrap rounded-md border border-input border-dashed bg-muted/30 px-3 py-1.5 font-mono text-muted-foreground text-xs">
        {pattern}
      </p>
    </div>
  );
}
