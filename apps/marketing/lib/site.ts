export const SITE_URL = "https://openinary.dev";
export const APP_URL = "https://app.openinary.dev";
/** The docs share this origin: the `docs` Worker answers openinary.dev/docs*
 * (apps/docs), and in dev a route handler proxies /docs to a local build. */
export const DOCS_URL = "/docs";
export const REPO = "openinary/openinary";
export const REPO_URL = `https://github.com/${REPO}`;

/** The homepage playground upload sink rejects anything larger. */
export const PLAYGROUND_MAX_BYTES = 10 * 1024 * 1024;
