/**
 * The pages name their icons in Font Awesome, as Mintlify did. They render
 * in Solar Bold Duotone, the set the marketing site and the dashboard use
 * (CC BY 4.0, 480 Design; credited on openinary.dev/legal).
 */
const SOLAR: Record<string, string> = {
  bolt: "bolt",
  book: "book",
  "chart-bar": "chart-2",
  "chart-simple": "chart",
  "circle-info": "info-circle",
  cloud: "cloud",
  code: "code",
  copy: "copy",
  database: "database",
  download: "download",
  file: "file",
  "file-zipper": "zip-file",
  film: "videocamera-record",
  folder: "folder",
  "folder-open": "folder-open",
  "folder-plus": "add-folder",
  "folder-tree": "folder-with-files",
  gauge: "chart",
  gear: "settings",
  gears: "settings-minimalistic",
  globe: "global",
  image: "gallery",
  key: "key",
  list: "list",
  lock: "lock-keyhole",
  pen: "pen",
  plus: "add-circle",
  "puzzle-piece": "widget",
  rocket: "rocket",
  rotate: "refresh",
  "satellite-dish": "satellite",
  server: "server",
  signature: "pen-new-square",
  terminal: "programming",
  toolbox: "box",
  trash: "trash-bin-trash",
  upload: "upload",
  video: "videocamera",
  "wand-magic-sparkles": "magic-stick-3",
};

/** An Iconify name for an icon a page names: Font Awesome names map to Solar, set-prefixed names pass through. */
export function iconName(name: string): string {
  if (name.includes(":")) return name;
  const solar = SOLAR[name];
  if (!solar) throw new Error(`No Solar icon for "${name}": add it to src/lib/icons.ts`);
  return `solar:${solar}-bold-duotone`;
}
