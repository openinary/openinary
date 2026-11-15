/**
 * Telegram credentials, both *Worker secrets*, never `vars`:
 *   TELEGRAM_BOT_TOKEN, from @BotFather
 *   TELEGRAM_CHAT_ID, the chat to deliver to
 *
 * Same bot as the marketing site's lead pings (see lib/push.ts there), so
 * every signup lands in the one chat that already gets watched.
 */
const API = "https://api.telegram.org";

/** User data reaches Telegram's HTML parser, so `<` in a name must not open a tag. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function notify(title: string, body: string, url?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  // The account already exists by the time we get here, so a missing credential
  // degrades to silence instead of throwing: a ping must never cost a signup.
  if (!token || !chat) return;

  const text = [
    `<b>${esc(title)}</b>`,
    esc(body),
    ...(url ? [`<a href="${esc(url)}">Open in admin</a>`] : []),
  ].join("\n");

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      body: new URLSearchParams({
        chat_id: chat,
        text,
        parse_mode: "HTML",
        // The admin link is behind a login, so its preview card is dead weight.
        disable_web_page_preview: "true",
      }),
    });
    // Never log the response URL: it carries the bot token in the path.
    if (!res.ok) console.error(`telegram → ${res.status} ${await res.text()}`);
  } catch (error) {
    console.error("telegram failed:", error);
  }
}
