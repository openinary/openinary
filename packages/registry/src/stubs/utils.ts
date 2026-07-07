// Type-check stub for the consumer's `@/lib/utils`. Not part of the registry
// output — the shadcn CLI provides the real `cn` from the user's project.
export function cn(...inputs: Array<string | undefined | null | false>): string {
  return inputs.filter(Boolean).join(" ");
}
