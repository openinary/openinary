// The F0 photo card (hills, 480x360 cover, radius 14, hairline, card shadow) and the file chip under it.
// Both are positioned by their centre / top in screen px and take every animatable value as a prop.
import { FileImage } from "../lib/icons";
import { MEDIA, type Media } from "../lib/media";
import { C, FONT, SHADOW } from "../lib/tokens";
import { Photo } from "./Photo";

export const CARD = { cx: 960, cy: 720, w: 480, h: 360, radius: 14 } as const;
export const CHIP = { cx: 960, top: 916, h: 44, radius: 10, padX: 14, icon: 20, iconGap: 10, gap: 12 } as const;

export type FileCardProps = {
  cx?: number;
  cy?: number;
  w?: number;
  h?: number;
  radius?: number;
  /** Scale about the card centre (the F0 card is centred on R, so this is also "about R"). */
  scale?: number;
  rotate?: number; // deg
  opacity?: number;
  shadow?: string;
  media?: Media;
};

export const FileCard = ({
  cx = CARD.cx,
  cy = CARD.cy,
  w = CARD.w,
  h = CARD.h,
  radius = CARD.radius,
  scale = 1,
  rotate = 0,
  opacity = 1,
  shadow = SHADOW.card,
  media = MEDIA.hills1000,
}: FileCardProps) => {
  if (opacity <= 0) return null;
  const tf = scale === 1 && rotate === 0 ? undefined : `scale(${scale}) rotate(${rotate}deg)`;
  return (
    <Photo
      media={media}
      w={w}
      h={h}
      x={cx - w / 2}
      y={cy - h / 2}
      radius={radius}
      hairline
      shadow={shadow}
      opacity={opacity === 1 ? undefined : opacity}
      style={tf ? { transform: tf, transformOrigin: "50% 50%" } : undefined}
    />
  );
};

export type FileChipProps = { cx?: number; top?: number; opacity?: number; dy?: number; name?: string; size?: string };

export const FileChip = ({ cx = CHIP.cx, top = CHIP.top, opacity = 1, dy = 0, name = "hills.jpg", size = "2.81 MB" }: FileChipProps) => {
  if (opacity <= 0) return null;
  return (
    <div
      style={{ position: "absolute", left: cx - 400, top: top + dy, width: 800, display: "flex", justifyContent: "center", opacity: opacity === 1 ? undefined : opacity }}
    >
      <div
        style={{
          height: CHIP.h,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          padding: `0 ${CHIP.padX}px`,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: CHIP.radius,
          whiteSpace: "nowrap",
        }}
      >
        <FileImage size={CHIP.icon} color={C.muted} strokeWidth={1.75} style={{ display: "block", marginRight: CHIP.iconGap }} />
        <span style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: 24, color: C.ink, letterSpacing: "-0.01em", lineHeight: 1 }}>{name}</span>
        <span style={{ fontFamily: FONT.mono, fontWeight: 400, fontSize: 20, color: C.muted, marginLeft: CHIP.gap, lineHeight: 1 }}>{size}</span>
      </div>
    </div>
  );
};
