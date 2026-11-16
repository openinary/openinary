// The transform segments the dashboard requests its previews with. @openinary/ui
// builds its preview URLs from these, and the Cloud Worker serves exactly these
// from client-generated thumbnails (a miss is a 404, never a transform), so a
// segment built anywhere else silently loses its preview. No imports: the UI
// bundles this file.

export type DashboardThumbKind = "image" | "video";
/** preview: grid item and details sidebar; the rest: folder-card previews. */
export type DashboardThumbSize = "preview" | "large" | "tall" | "square";

// Videos extract a frame, cropped to the box (c_fill) rather than stretched.
const SEGMENTS: Record<DashboardThumbKind, Record<DashboardThumbSize, string>> = {
  image: {
    preview: "w_500,h_500,q_80",
    large: "w_500,h_500,q_70",
    tall: "w_250,h_500,q_70",
    square: "w_250,h_250,q_70",
  },
  video: {
    preview: "t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80",
    large: "t_true,tt_5,f_webp,w_500,h_500,c_fill,q_70",
    tall: "t_true,tt_5,f_webp,w_250,h_500,c_fill,q_70",
    square: "t_true,tt_5,f_webp,w_250,h_250,c_fill,q_70",
  },
};

/** The transform segment of one dashboard preview. */
export function dashboardThumbSegment(kind: DashboardThumbKind, size: DashboardThumbSize): string {
  return SEGMENTS[kind][size];
}

/** Every segment of one kind, "preview" first. */
export function dashboardThumbSegments(kind: DashboardThumbKind): string[] {
  return Object.values(SEGMENTS[kind]);
}
