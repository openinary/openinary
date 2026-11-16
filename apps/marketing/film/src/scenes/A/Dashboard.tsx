// The self-hosted dashboard window (Assets view) with the Upload files dialog (v5: packages/dashboard as of
// 2026-11-12). The chrome is written in the dashboard's own CSS px inside a <Css> box scaled by K, so every number
// below is a measurement off the live DOM at a 1440 px viewport. Two layers share the window's clip so the
// screen-space <HillsTile> can sit between them (see SceneA):
//   <WindowBase>    page, sidebar, header panel, folders, the other file tiles: all of it dissolves in S4
//   <WindowOverlay> veil + Upload files dialog (+ the dropped card, which rides the dialog)
import type { CSSProperties, ReactNode } from "react";
import { FileCard } from "../../components/FileCard";
import { Photo, coverRect } from "../../components/Photo";
import { CheckCircle2, FileImage, Folder, LayoutGrid, List, Plus, Square, Upload, X, type LucideIcon } from "../../lib/icons";
// Not in lib/icons; same pinned lucide-react.
import { ChevronsUpDown, FolderOpen, PanelLeft, Search, CircleDashed, ChevronDown } from "lucide-react";
import { MEDIA, type Media } from "../../lib/media";
import { SHARDS, SHARD_IDS } from "../../lib/shards";
import { T } from "../../timeline";
import { C, DASH, FONT } from "../../lib/tokens";
import { DLG, DONE, DROPZONE, FILE_ICON, FILE_ROW_Y, K, LIST, SEL, TILE, TILE_RADIUS, UPLOAD_BTN, VIEW, WIN } from "./layout";
import { SOLAR } from "./solar";
import {
  cardAt,
  cardShadow,
  dialogH,
  dialogOpacity,
  dialogScale,
  doneScale,
  doneT,
  fileTileX,
  hillsTileAt,
  hoverAt,
  iconIn,
  rowDy,
  rowTextT,
  selectionOpacity,
  tileHover,
  uploadPress,
  uploading,
  veilOpacity,
} from "./motion";

const D = DASH; // theme-aware (lib/tokens applyTheme)
const mix = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------------------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------------------
const box = (x: number, y: number, w: number, h: number, s: CSSProperties = {}): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box", ...s });

/** A box in the dashboard's CSS px: (x, y) in design px of the parent, content scaled by K. */
const Css = ({ x = 0, y = 0, w, h, children, style }: { x?: number; y?: number; w: number; h: number; children: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `scale(${K})`, transformOrigin: "0 0", fontFamily: FONT.sans, ...style }}>{children}</div>
);

/** Text in CSS px laid out like the DOM: a line box of height `lh` whose top is `top`. */
const Tx = ({ x, top, size, lh, weight = 400, color = D.ink, ls, anchor = "start", children, style }: {
  x: number; top: number; size: number; lh: number; weight?: number; color?: string; ls?: number; anchor?: "start" | "middle" | "end"; children: ReactNode; style?: CSSProperties;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top,
      height: lh,
      lineHeight: `${lh}px`,
      fontSize: size,
      fontWeight: weight,
      color,
      letterSpacing: ls,
      whiteSpace: "nowrap",
      transform: anchor === "middle" ? "translateX(-50%)" : anchor === "end" ? "translateX(-100%)" : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Lucide icon with its top-left at (x, y), CSS px. */
const Ic = ({ I, x, y, size, color = D.icon, sw = 2 }: { I: LucideIcon; x: number; y: number; size: number; color?: string; sw?: number }) => (
  <I size={size} color={color} strokeWidth={sw} style={{ position: "absolute", left: x, top: y, display: "block" }} />
);

/** The Openinary mark (the dashboard's icon.svg: the seven shards in ink). */
const Logo = ({ x, y, size }: { x: number; y: number; size: number }) => (
  <svg viewBox="0 0 104 104" width={size} height={size} style={{ position: "absolute", left: x, top: y }}>
    {SHARD_IDS.map((id) => (
      <path key={id} d={SHARDS[id].d} fill={D.ink} />
    ))}
  </svg>
);

const WindowClip = ({ rise, opacity, children, style }: { rise: number; opacity?: number; children: ReactNode; style?: CSSProperties }) => (
  <div style={box(WIN.x, WIN.y + rise, WIN.w, WIN.h, { borderRadius: WIN.r, overflow: "hidden", opacity: opacity === 1 ? undefined : opacity, ...style })}>{children}</div>
);

// ---------------------------------------------------------------------------------------------------------
// Sidebar (CSS px)
// ---------------------------------------------------------------------------------------------------------
const NAV: { label: string; top: number }[] = [
  { label: "Home", top: 66 },
  { label: "Assets", top: 100 },
  { label: "Logs", top: 134 },
  { label: "Storage", top: 168 },
  { label: "API keys", top: 202 },
  { label: "Integrate", top: 291 },
  { label: "Images", top: 325 },
  { label: "Videos", top: 359 },
  { label: "Uploader", top: 393 },
  { label: "Settings", top: 465 },
];

const Sidebar = () => (
  <>
    <Logo x={26} y={23} size={18} />
    <Tx x={52} top={22} size={15} lh={20} weight={600} ls={-0.3}>
      Openinary
    </Tx>
    <Ic I={Search} x={168} y={24} size={16} sw={1.6} />
    <Ic I={PanelLeft} x={201} y={25} size={14} />
    {/* active row */}
    <div style={box(16, 94, 208, 32, { borderRadius: 10, background: D.active, boxShadow: D.activeShadow })} />
    {NAV.map(({ label, top }) => {
      const active = label === "Assets";
      return (
        <div key={label}>
          <svg viewBox="0 0 24 24" width={18} height={18} style={{ position: "absolute", left: 26, top: top + 1, color: active ? D.ink : D.icon }}>
            {SOLAR[label]}
          </svg>
          <Tx x={52} top={top} size={14} lh={20} ls={-0.084} color={active ? D.ink : D.nav}>
            {label}
          </Tx>
        </div>
      );
    })}
    {[
      { label: "Build", top: 263, chevronX: 60.3 },
      { label: "Workspace", top: 437, chevronX: 94.8 },
    ].map((g) => (
      <div key={g.label}>
        <Tx x={20} top={g.top} size={12} lh={16} color={D.faint}>
          {g.label}
        </Tx>
        <Ic I={ChevronDown} x={g.chevronX} y={g.top + 4.5} size={7} color={D.faint} sw={3} />
      </div>
    ))}
    {/* setup guide + workspace switcher */}
    <div style={box(16, VIEW.h - 100, 208, 36, { borderRadius: 8, boxShadow: `0 0 0 1px ${D.ring}` })} />
    <Ic I={CircleDashed} x={26} y={VIEW.h - 89} size={14} color={D.blue} />
    <Tx x={50} top={VIEW.h - 92} size={13} lh={20} color={D.nav}>
      Setup guide
    </Tx>
    <Tx x={214} top={VIEW.h - 90} size={12} lh={16} color={D.faint} anchor="end">
      0 / 3
    </Tx>
    <div style={box(20, VIEW.h - 52, 32, 32, { borderRadius: 10, background: "#3A1820", color: "#F5A3B5", fontSize: 13, fontWeight: 600, lineHeight: "32px", textAlign: "center" })}>A</div>
    <Tx x={62} top={VIEW.h - 53} size={14} lh={18}>
      {"Ada's Team"}
    </Tx>
    <Tx x={62} top={VIEW.h - 35} size={11.5} lh={16} color={D.icon}>
      Self-hosted
    </Tx>
    <Ic I={ChevronsUpDown} x={158} y={VIEW.h - 43} size={14} color={D.faint} />
    <div style={box(188, VIEW.h - 52, 32, 32, { borderRadius: 16, background: D.avatar, color: D.nav, fontSize: 11, fontWeight: 500, lineHeight: "32px", textAlign: "center" })}>AP</div>
  </>
);

// ---------------------------------------------------------------------------------------------------------
// Header bar + folders (CSS px, inside the white panel)
// ---------------------------------------------------------------------------------------------------------
const Header = () => (
  <>
    <Tx x={260} top={26} size={14} lh={20} weight={500}>
      Assets
    </Tx>
    <Ic I={Square} x={1093.9} y={29} size={14} />
    <div style={box(1115.9, 33, 98, 6, { borderRadius: 3, background: D.track })} />
    <div style={box(1115.9, 33, 98, 6, { borderRadius: 3, background: D.ink })} />
    <div style={box(1189.9, 29, 24, 14, { borderRadius: 7, background: D.control, border: `1px solid ${D.ring}`, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" })} />
    <Ic I={LayoutGrid} x={1221.9} y={28} size={16} />
    <div style={box(1245.9, 23, 68, 26, { borderRadius: 12, background: D.seg, boxShadow: `inset 0 0 0 1px ${D.ring}` })} />
    <div style={box(1248.9, 26, 30, 20, { borderRadius: 9, background: D.segOn, boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06)" })} />
    <Ic I={LayoutGrid} x={1256.9} y={29} size={14} color={D.ink} />
    <Ic I={List} x={1288.9} y={29} size={14} />
    <div style={box(1321.9, 20, 90.1, 32, { borderRadius: 9, background: D.primary, border: `1px solid ${D.primaryRing}` })} />
    <Ic I={Upload} x={1334.9} y={29} size={14} color="#FFFFFF" />
    <Tx x={1356.9} top={28} size={13} lh={16} weight={500} color="#FFFFFF">
      Upload
    </Tx>
  </>
);

const Folders = () => (
  <>
    <div style={box(260, 68, 190, 180, { borderRadius: 14, border: `1px dashed ${D.dash}` })} />
    <Ic I={Plus} x={345} y={134} size={20} sw={1.5} />
    <Tx x={355} top={162} size={13} lh={20} color={D.icon} anchor="middle">
      New folder
    </Tx>
    <div style={box(466, 68, 190, 180, { borderRadius: 14, background: D.panel, boxShadow: `0 0 0 1px ${D.cardRing}` })} />
    <div style={box(472, 74, 178, 138, { borderRadius: 12, background: D.well, boxShadow: `0 0 0 1px ${D.cardRing}` })} />
    <Ic I={Folder} x={547} y={129} size={28} color={D.faint} sw={1.5} />
    <Tx x={478} top={220} size={13} lh={20} weight={500}>
      videos
    </Tx>
    <Tx x={644} top={222} size={12} lh={16} color={D.faint} anchor="end">
      1 item
    </Tx>
  </>
);

// ---------------------------------------------------------------------------------------------------------
// File tiles (design px: they FLIP on the motion's columns)
// ---------------------------------------------------------------------------------------------------------
/** `zoomTop` crops the bottom of the cover image (scale about the top centre). */
const Tile = ({ x, y, media, zoomTop = 1 }: { x: number; y: number; media: Media; zoomTop?: number }) => {
  const r = coverRect(media, { w: TILE, h: TILE });
  const img = { x: TILE / 2 - (TILE / 2 - r.x) * zoomTop, y: r.y * zoomTop, w: r.w * zoomTop, h: r.h * zoomTop };
  return (
    <div style={box(x, y, TILE, TILE, { borderRadius: TILE_RADIUS, overflow: "hidden", background: D.well })}>
      <Photo media={media} w={TILE} h={TILE} x={0} y={0} imageRect={img} />
      <div style={{ position: "absolute", inset: 0, borderRadius: TILE_RADIUS, boxShadow: `inset 0 0 0 ${K}px ${D.ring}` }} />
    </div>
  );
};

// The animation poster frame has an on-screen cursor near its bottom edge: crop it (1.14x about the top) so the
// film never shows two cursors.
const FILE_TILES: { media: Media; slot: number; zoomTop?: number }[] = [
  { media: MEDIA.portrait, slot: 1 },
  { media: MEDIA.productAnimation, slot: 2, zoomTop: 1.14 },
  { media: MEDIA.productShoot, slot: 3 },
];

/** Page, sidebar, the white panel with header, folders and the other file tiles. */
export const WindowBase = ({ f, rise, opacity }: { f: number; rise: number; opacity: number }) => (
  <WindowClip rise={rise} opacity={opacity} style={{ background: D.page, boxShadow: `0 0 0 ${K}px ${D.ring}, 0 24px 60px -20px rgba(0,0,0,0.14)` }}>
    <Css w={VIEW.w} h={VIEW.h}>
      <div style={box(240, 8, 1192, VIEW.h - 16, { borderRadius: 14, background: D.panel, boxShadow: `0 0 0 1px ${D.ring}` })} />
      <Sidebar />
      <Header />
      <Folders />
    </Css>
    {FILE_TILES.map(({ media, slot, zoomTop }) => (
      <Tile key={media.src} x={fileTileX(f, slot)} y={FILE_ROW_Y} media={media} zoomTop={zoomTop} />
    ))}
  </WindowClip>
);

// ---------------------------------------------------------------------------------------------------------
// Upload files dialog (dialog-local design px for the boxes the motion knows; text and chrome in CSS px)
// ---------------------------------------------------------------------------------------------------------
const Dropzone = ({ hover }: { hover: number }) => (
  <Css x={DROPZONE.x} y={DROPZONE.y} w={632} h={280}>
    <div
      style={box(0, 0, 632, 280, {
        borderRadius: 10,
        background: hover > 0 ? mix(D.blue, 0.05 * hover) : D.drop,
        border: `2px dashed ${hover > 0 ? mix(D.blue, 0.25 + 0.75 * hover) : D.ring}`,
      })}
    />
    {hover < 1 ? (
      <div style={{ position: "absolute", inset: 0, opacity: hover > 0 ? 1 - hover : undefined }}>
        <Ic I={Upload} x={292} y={50} size={48} />
        <Tx x={316} top={114} size={18} lh={28} weight={500} anchor="middle">
          Drop files here, or click to select files
        </Tx>
        <Tx x={316} top={158} size={13} lh={20} color={D.icon} anchor="middle">
          Supports: JPG, PNG, WebP, AVIF, GIF, HEIC, PSD, MP4, MOV, WebM
        </Tx>
        <div style={box(257.2, 202, 117.7, 28, { borderRadius: 9, background: D.control, border: `1px solid ${D.dash}` })} />
        <FolderOpen size={14} color={D.ink} strokeWidth={2} style={{ position: "absolute", left: 268.2, top: 209 }} />
        <Tx x={290} top={208} size={12} lh={16} weight={500}>
          Select folder
        </Tx>
      </div>
    ) : null}
    {hover > 0 ? (
      <div style={{ position: "absolute", inset: 0, opacity: hover < 1 ? hover : undefined }}>
        <Ic I={Upload} x={292} y={86} size={48} color={D.blue} />
        <Tx x={316} top={150} size={18} lh={28} weight={500} color={D.blue} anchor="middle">
          Drop files here...
        </Tx>
      </div>
    ) : null}
  </Css>
);

/** The product's Spinner (arc: 360 deg per 2 s, dash 0 -> 42 and offset 0 -> -16 -> -59 per 1.5 s), frame-driven. */
const Spinner = ({ f, x, y, size, color }: { f: number; x: number; y: number; size: number; color: string }) => {
  const t = Math.max(0, f - T.S3.uploadPress);
  const c = (t % 90) / 90;
  const dash = c < 0.5 ? 84 * c : 42;
  const off = c < 0.5 ? -32 * c : -16 - 86 * (c - 0.5);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} style={{ position: "absolute", left: x, top: y }}>
      <circle cx={12} cy={12} r={9.5} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={`${dash} 150`} strokeDashoffset={off} transform={`rotate(${(t * 3) % 360} 12 12)`} />
      <circle cx={12} cy={12} r={9.5} fill="none" strokeWidth={2} opacity={0.1} />
    </svg>
  );
};

/** "1 file(s) selected" + Upload files (pressed, then spinner + Uploading..., disabled) + the one-row file list. */
const Selection = ({ f }: { f: number }) => {
  const o = selectionOpacity(f);
  if (o <= 0) return null;
  const pr = uploadPress(f);
  const busy = uploading(f);
  const tt = rowTextT(f);
  const ic = iconIn(f);
  const b = UPLOAD_BTN;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o === 1 ? undefined : o, transform: `translateY(${rowDy(f)}px)` }}>
      <Css x={DROPZONE.x} y={SEL.y} w={632} h={32}>
        <Tx x={0} top={2} size={18} lh={28} weight={600}>
          {"1 file(s) selected"}
        </Tx>
      </Css>
      <div style={box(b.x, b.y, b.w, b.h, { transform: pr.target === 1 ? undefined : `scale(${pr.target})`, transformOrigin: "50% 50%" })}>
        <Css w={121.5} h={32}>
          <div style={box(0, 0, 121.5, 32, { borderRadius: 9, background: D.primary, border: `1px solid ${D.primaryRing}`, opacity: busy ? 0.5 : undefined })}>
            {pr.darken > 0 ? <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: `rgba(0,0,0,${(pr.darken * 4).toFixed(4)})` }} /> : null}
          </div>
          {busy ? (
            <>
              <Spinner f={f} x={11} y={8} size={16} color="#FFFFFF" />
              <Tx x={33} top={8} size={13} lh={16} weight={500} color="#FFFFFF">
                Uploading...
              </Tx>
            </>
          ) : (
            <>
              <Ic I={Upload} x={13} y={9} size={14} color="#FFFFFF" />
              <Tx x={35} top={8} size={13} lh={16} weight={500} color="#FFFFFF">
                Upload files
              </Tx>
            </>
          )}
        </Css>
      </div>
      <Css x={LIST.x} y={LIST.y} w={632} h={62}>
        <div style={box(0, 0, 632, 62, { borderRadius: 10, background: D.panel, border: `1px solid ${D.ring}` })} />
        {ic > 0 ? (
          <div style={{ position: "absolute", inset: 0, opacity: ic < 1 ? ic : undefined }}>
            <Ic I={FileImage} x={FILE_ICON.cx / K - 28} y={23} size={16} color={D.blue} />
          </div>
        ) : null}
        {tt > 0 ? (
          <div style={{ position: "absolute", inset: 0, opacity: tt < 1 ? tt : undefined, transform: `translateX(${8 * (1 - tt)}px)` }}>
            <Tx x={45} top={13} size={13} lh={20} weight={500}>
              hills.jpg
            </Tx>
            <Tx x={45} top={33} size={12} lh={16} color={D.icon}>
              2.81 MB
            </Tx>
          </div>
        ) : null}
      </Css>
    </div>
  );
};

/** Upload result: green box, CheckCircle2 pop, "Successfully uploaded 1 file(s)", the hills.jpg / 2.81 MB / View row. */
const Result = ({ f }: { f: number }) => {
  const t = doneT(f);
  if (t <= 0) return null;
  const k = doneScale(f);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: t < 1 ? t : undefined, transform: `translateY(${8 * (1 - t)}px)` }}>
      <Css x={DONE.x} y={DONE.y} w={632} h={128}>
        <div style={box(0, 0, 632, 128, { borderRadius: 8, background: mix(D.green, 0.1), border: `1px solid ${mix(D.green, 0.3)}` })} />
        <div style={box(17, 17, 20, 20, { transform: `scale(${k})`, transformOrigin: "50% 50%" })}>
          <CheckCircle2 size={20} color={D.green} strokeWidth={2} />
        </div>
        <Tx x={45} top={17} size={16} lh={24} weight={600} color={D.green}>
          {"Successfully uploaded 1 file(s)"}
        </Tx>
        <div style={box(17, 53, 598, 62, { borderRadius: 4, background: D.panel, border: `1px solid ${mix(D.green, 0.3)}` })} />
        <Tx x={30} top={64} size={13} lh={20} weight={500}>
          hills.jpg
        </Tx>
        <Tx x={30} top={84} size={12} lh={16} color={D.icon}>
          2.81 MB
        </Tx>
        <Tx x={602} top={76} size={12} lh={16} weight={500} color={D.blue} anchor="end">
          View
        </Tx>
      </Css>
    </div>
  );
};

export const WindowOverlay = ({ f, rise }: { f: number; rise: number }) => {
  const veil = veilOpacity(f);
  const dop = dialogOpacity(f);
  if (veil <= 0 && dop <= 0) return null;
  const card = cardAt(f);
  const s = dialogScale(f);
  return (
    <WindowClip rise={rise}>
      {veil > 0 ? <div style={{ position: "absolute", inset: 0, background: `rgba(${D.veil.split(",").slice(0, 3).join(",")},${(Number(D.veil.split(",")[3]) * veil).toFixed(4)})` }} /> : null}
      {dop > 0 ? (
        <div
          style={box(DLG.x, DLG.y, DLG.w, dialogH(f), {
            borderRadius: DLG.r,
            background: D.dialog,
            boxShadow: D.dialogShadow,
            opacity: dop === 1 ? undefined : dop,
            transform: s === 1 ? undefined : `scale(${s})`,
            transformOrigin: "50% 50%",
          })}
        >
          {/* the content is clipped to the growing dialog; the dropped card is not (its lifted shadow overhangs) */}
          <div style={{ position: "absolute", inset: 0, borderRadius: DLG.r, overflow: "hidden" }}>
            <Css w={672} h={60}>
              <Tx x={20} top={20} size={16} lh={24} weight={600}>
                Upload files
              </Tx>
              <Ic I={X} x={636} y={20} size={16} />
            </Css>
            <Dropzone hover={hoverAt(f)} />
            <Selection f={f} />
            <Result f={f} />
          </div>
          {card.space === "dialog" && card.opacity > 0 ? (
            <FileCard cx={card.cx} cy={card.cy} w={card.w} h={card.h} radius={card.radius} scale={card.scale} rotate={card.rot} opacity={card.opacity} shadow={cardShadow(card)} />
          ) : null}
        </div>
      ) : null}
    </WindowClip>
  );
};

// ---------------------------------------------------------------------------------------------------------
// The hills tile, in SCREEN space (between the two window layers) so the dive ends on exactly the pixels scene B
// starts with. Grid hover state: bottom name gradient + the round selection checkbox.
// ---------------------------------------------------------------------------------------------------------
export const HillsTile = ({ f }: { f: number }) => {
  const t = hillsTileAt(f);
  if (t.opacity <= 0) return null;
  const hov = tileHover(f);
  const z = t.zoom * K; // CSS px -> screen px
  const { box: b, img } = t;
  return (
    <div
      style={{
        position: "absolute",
        left: b.x,
        top: b.y,
        width: b.w,
        height: b.h,
        opacity: t.opacity === 1 ? undefined : t.opacity,
        borderRadius: t.radius,
        boxShadow: hov > 0 ? `0 ${4 * z}px ${6 * z}px ${-1 * z}px rgba(0,0,0,${(0.1 * hov).toFixed(4)}), 0 ${2 * z}px ${4 * z}px ${-2 * z}px rgba(0,0,0,${(0.1 * hov).toFixed(4)})` : undefined,
      }}
    >
      <Photo media={MEDIA.hills2400} w={b.w} h={b.h} x={0} y={0} radius={t.radius} imageRect={{ x: img.x - b.x, y: img.y - b.y, w: img.w, h: img.h }} />
      {t.darken > 0 ? <div style={{ position: "absolute", inset: 0, borderRadius: t.radius, background: `rgba(0,0,0,${t.darken.toFixed(4)})` }} /> : null}
      {hov > 0 ? (
        <div style={{ position: "absolute", inset: 0, borderRadius: t.radius, overflow: "hidden", opacity: hov === 1 ? undefined : hov }}>
          <div style={box(0, b.h - 44 * z, b.w, 44 * z, { background: "linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))" })} />
          <div style={{ position: "absolute", left: 8 * z, top: b.h - 24 * z, fontFamily: FONT.sans, fontSize: 12 * z, lineHeight: `${16 * z}px`, fontWeight: 500, color: C.white, whiteSpace: "nowrap" }}>hills.jpg</div>
          <div style={box(9 * z, 9 * z, 20 * z, 20 * z, { borderRadius: 10 * z, background: "rgba(0,0,0,0.3)", border: `${z}px solid rgba(255,255,255,0.4)` })} />
        </div>
      ) : null}
      {t.border > 0.01 ? <div style={{ position: "absolute", inset: 0, borderRadius: t.radius, boxShadow: `inset 0 0 0 ${t.border}px ${D.ring}` }} /> : null}
    </div>
  );
};
