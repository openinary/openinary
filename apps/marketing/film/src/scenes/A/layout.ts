// Scene A layout (v5): the self-hosted dashboard's Assets view as packages/dashboard renders it today, measured off
// the live DOM at a 1440 px viewport (2026-11-12) and scaled by K = 1663 / 1440 into the film's window.
// Window-local design px unless noted (CSS px x K); screen = window-local + (129, 548).
import { T } from "../../timeline";

const { window: w, dialog: d } = T.S2;

/** Design px per dashboard CSS px. */
export const K = w.w / 1440;
/** The window as a 1440 x 1063 CSS px viewport. */
export const VIEW = { w: 1440, h: w.h / K } as const;

export const WIN = { x: w.x, y: w.y, w: w.w, h: w.h, r: w.radius } as const;

/** Media grid: 248 CSS px tiles (the size slider at its top stop), 16 px gaps, under the two folder cards. */
export const TILE = 286;
export const FILE_COLS = [260, 524, 788, 1052].map((x) => x * K) as readonly number[];
export const FILE_ROW_Y = 280 * K;
export const FOLDER = { y: 68 * K, w: 190 * K, h: 180 * K, xs: [260 * K, 466 * K] } as const;
export const TILE_RADIUS = 10 * K;

/**
 * Upload files dialog = DefaultDialog + UploadSection (packages/ui/src/components/upload-section.tsx), dialog-local
 * design px. 672 CSS px wide. Idle it hugs the dropzone (h0); once a file is selected it grows, top fixed, to h.
 */
export const DLG = { x: d.local.x - d.w / 2, y: d.local.y - d.h / 2, w: d.w, h: d.h, h0: 360 * K, r: d.radius } as const;
export const DROPZONE = { x: 20 * K, y: 60 * K, w: 632 * K, h: 280 * K, r: 10 * K } as const; // centre = screen (960, 842)
/** "1 file(s) selected" row (h3 + the primary Upload files button), then the bordered one-row file list. */
export const SEL = { y: 356 * K, h: 32 * K, btnW: 121.5 * K, btnR: 9 * K } as const;
export const LIST = { x: 20 * K, y: 404 * K, w: 632 * K, h: 62 * K, r: 10 * K } as const;
export const FILE_ICON = { cx: 45 * K, size: 16 * K } as const; // FileImage (ds-blue) slot, dialog-local centre x
/** Upload result: green box (CheckCircle2, "Successfully uploaded 1 file(s)", a hills.jpg / 2.81 MB / View row). */
export const DONE = { x: 20 * K, y: 356 * K, w: 632 * K, h: 128 * K, r: 8 * K } as const;

/** Upload files button rect (dialog-local). */
export const UPLOAD_BTN = { x: DROPZONE.x + DROPZONE.w - SEL.btnW, y: SEL.y, w: SEL.btnW, h: SEL.h } as const;
/** Where the dropped card lands (dialog-local): a 4:3 thumbnail on the FileImage icon slot, given the list's slide-in. */
export const rowThumb = (dy: number) => ({ x: FILE_ICON.cx - 14, y: LIST.y + LIST.h / 2 - 10.5 + dy, w: 28, h: 21 });
