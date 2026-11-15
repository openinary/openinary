// Stub-only label (delete when every scene is built).
import { C, FONT } from "../lib/tokens";

export const Placeholder = ({ id, range, frame }: { id: string; range: { from: number; to: number }; frame: number }) => (
  <div
    style={{
      position: "absolute",
      left: 96,
      bottom: 96,
      padding: "10px 16px",
      border: `1.5px dashed ${C.dashed}`,
      borderRadius: 10,
      fontFamily: FONT.mono,
      fontSize: 22,
      color: C.muted,
      background: "rgba(255,255,255,0.6)",
    }}
  >
    {`scene ${id} stub · f${range.from} to f${range.to} · frame ${frame}`}
  </div>
);
