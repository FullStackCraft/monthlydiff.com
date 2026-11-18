import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { Resend } from "resend";
import { createNewsletter, NewsletterError, normalizeEmail } from "../../lib/newsletter";
import { publication } from "../../lib/theme";

const reply = (status: number, message: string) =>
  Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

export default async function newsletter(req: Request) {
  const action = new URL(req.url).pathname.split("/").at(-1);
  if (action !== "subscribe" && action !== "confirm" && action !== "unsubscribe") {
    return reply(404, "Page not found.");
  }
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site") return reply(403, "Please use the signup form on The Monthly Diff.");
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return reply(415, "Expected a JSON request.");
  }

  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return reply(413, "The request is too large.");
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
  } catch {
    return reply(400, "Invalid request.");
  }

  const email = normalizeEmail(payload.email);
  if (action === "subscribe" && !email) return reply(400, "Enter a valid email address.");
  if (action !== "subscribe" && typeof payload.token !== "string") return reply(400, "The email link is missing.");
  const requested = "Check your inbox for a confirmation link. If you already confirmed, you’re all set.";
  if (action === "subscribe" && payload.website) return reply(202, requested);

  const secret = Netlify.env.get("NEWSLETTER_LINK_SECRET")?.trim();
  const segment = Netlify.env.get("RESEND_SEGMENT_ID")?.trim();
  const contactsKey = Netlify.env.get("RESEND_CONTACTS_API_KEY")?.trim();
  const sendingKey = Netlify.env.get("RESEND_API_KEY")?.trim();
  const from = (Netlify.env.get("RESEND_FROM") || Netlify.env.get("RESEND_FROM_EMAIL"))?.trim();
  const replyTo = Netlify.env.get("RESEND_REPLY_TO")?.trim() || undefined;
  const local = Netlify.env.get("CONTEXT") === "dev" || Netlify.env.get("NETLIFY_DEV") === "true";
  const origin = local
    ? (Netlify.env.get("NEWSLETTER_LOCAL_ORIGIN") ?? "http://127.0.0.1:8888")
    : publication.origin;

  if (!secret || secret.length < 32 || !segment || !contactsKey || !from ||
    (action === "subscribe" && Netlify.env.get("NEWSLETTER_SIGNUP_ENABLED") !== "true")) {
    return reply(503, "Email signup is temporarily unavailable.");
  }

  try {
    const resend = new Resend(contactsKey);
    const blobs = getStore({ name: "newsletter-confirmations", consistency: "strong" });
    const store = {
      setJSON: blobs.setJSON.bind(blobs),
      async getWithMetadata(key: string, options: { type: "json" }) {
        const entry = await blobs.getWithMetadata(key, options);
        if (!local || !entry || entry.etag) return entry;

        // The CLI sandbox exposes ETags on list and writes, but can omit them on GET.
        async function localEtag() {
          const { blobs: matches } = await blobs.list({ prefix: key });
          return matches.find((match) => match.key === key)?.etag;
        }
        const before = await localEtag();
        const fresh = await blobs.getWithMetadata(key, options);
        if (!fresh) return null;
        if (!before || before !== await localEtag()) {
          throw new NewsletterError(409, "This signup is being updated. Please try again in a moment.");
        }
        return { ...fresh, etag: before };
      },
    };
    const service = createNewsletter({
      secret, segment, origin, from, replyTo, resend,
      sender: sendingKey ? new Resend(sendingKey) : resend,
      store,
    });
    if (action === "subscribe" && email) {
      await service.request(email);
      return reply(202, requested);
    }
    if (action !== "subscribe" && typeof payload.token === "string") {
      await service.apply(action, payload.token);
      return reply(200, action === "confirm" ? "You’re subscribed." : "You’re unsubscribed.");
    }
  } catch (error) {
    if (error instanceof NewsletterError) return reply(error.status, error.message);
    console.error("Newsletter request failed", error instanceof Error ? error.name : typeof error);
    return reply(503, "The email service is temporarily unavailable. Please try again.");
  }
  return reply(400, "Invalid request.");
}

export const config: Config = {
  path: "/api/newsletter/:action",
  method: "POST",
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 20 },
};
