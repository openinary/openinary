// The output frame in design coords, for scenes that must reach the frame edges or the frame line (whip column,
// guides, wall culling, rail culling). Film provides it per frame; the default is the 1920x1484 master (no framing).
import { createContext, useContext } from "react";
import { viewportAt, type Viewport } from "./framing";

export type { Viewport };

const Ctx = createContext<Viewport>(viewportAt(0));
export const ViewportProvider = Ctx.Provider;
export const useViewport = () => useContext(Ctx);
