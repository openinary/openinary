/**
 * Telegram credentials — both *Worker secrets*, never `vars`:
 *   TELEGRAM_BOT_TOKEN — from @BotFather
 *   TELEGRAM_CHAT_ID   — the chat to deliver to
 *
 * Telegram rate-limits per bot token, which is the whole reason it is here: ntfy.sh's
 * free tier limits on `basis: "ip"`, and a Worker egresses from a Cloudflare IP shared
 * with every other Worker, so its 250/day quota was already spent by strangers.
 */
const API = "https://api.telegram.org";

/** Lead data reaches Telegram's HTML parser, so `<` in a company name must not open a tag. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function notify(title: string, body: string, url?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  // The lead is already in Attio by the time we get here, so a missing credential
  // degrades to silence instead of throwing — a ping must never cost a signup.
  if (!token || !chat) return;

  const text = [
    `<b>${esc(title)}</b>`,
    esc(body),
    ...(url ? [`<a href="${esc(url)}">Open in Attio</a>`] : []),
  ].join("\n");

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      body: new URLSearchParams({
        chat_id: chat,
        text,
        parse_mode: "HTML",
        // The Attio link is behind a login, so its preview card is dead weight.
        disable_web_page_preview: "true",
      }),
    });
    // Never log the response URL: it carries the bot token in the path.
    if (!res.ok) console.error(`telegram → ${res.status} ${await res.text()}`);
  } catch (error) {
    console.error("telegram failed:", error);
  }
}
