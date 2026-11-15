/** MODE: "api" runs without the dashboard; anything else is the full stack. */
export function deploymentMode(): "api" | "fullstack" {
  return process.env.MODE?.toLowerCase().trim() === "api" ? "api" : "fullstack";
}
