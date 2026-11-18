import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Resend, type ErrorResponse } from "resend";
import { renderWelcomeEmail } from "../components/email/render-welcome-email";

type Signup = {
  nonce: string;
  requestedAt: number;
  status: "pending" | "confirmed" | "unsubscribed";
  busyUntil?: number;
};
type Store = {
  getWithMetadata(key: string, options: { type: "json" }): Promise<{ data: Signup; etag?: string } | null>;
  setJSON(key: string, data: Signup, options: { onlyIfNew: true; onlyIfMatch?: never } | { onlyIfNew?: never; onlyIfMatch: string }): Promise<{ modified: boolean; etag?: string }>;
};
type Action = "confirm" | "unsubscribe";
type Settings = {
  secret: string;
  segment: string;
  origin: string;
  from: string;
  replyTo?: string;
  resend: Resend;
  sender: Resend;
  store: Store;
};

const tokenLifetime = 24 * 60 * 60 * 1000;
const lockLifetime = 65_000;
const emailPattern = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
export const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : null;
};

export class NewsletterError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function providerError(error: ErrorResponse): never {
  console.error("Newsletter Resend request failed", error.name, error.statusCode);
  throw new NewsletterError(503, "The email service is temporarily unavailable. Please try again.");
}

async function resendRequest<T>(request: (signal: AbortSignal) => Promise<T & { error: ErrorResponse | null }>) {
  const result = await request(AbortSignal.timeout(5000));
  if (result.error?.statusCode !== 429) return result;
  await delay(1100);
  return request(AbortSignal.timeout(5000));
}

export function createNewsletter({ secret, segment, origin, from, replyTo, resend, sender, store }: Settings) {
  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const keyFor = (email: string) => sign(`signup:${segment}:${email}`);
  async function read(key: string) {
    const saved = await store.getWithMetadata(key, { type: "json" });
    if (!saved) return null;
    if (!saved.etag) throw new Error("Missing confirmation record ETag.");
    return { data: saved.data, etag: saved.etag };
  }
  const write = (key: string, entry: Signup, etag?: string) =>
    store.setJSON(key, entry, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });

  function link(action: Action, email: string, nonce: string) {
    const value = `${Buffer.from(email).toString("base64url")}.${nonce}`;
    return `${origin}/newsletter/${action}#${value}.${sign(`${action}:${segment}:${value}`)}`;
  }

  function busy(): never {
    throw new NewsletterError(409, "This signup is being updated. Please try again in a moment.");
  }

  async function findContact(email: string) {
    const { data, error } = await resendRequest((signal) => resend.contacts.get({ email }, { signal }));
    if (error && error.statusCode !== 404) providerError(error);
    return data;
  }

  async function subscribeContact(email: string) {
    const existing = await findContact(email);
    if (!existing) {
      const { error } = await resendRequest((signal) => resend.contacts.create({
        email, unsubscribed: false, segments: [{ id: segment }],
      }, { signal }));
      if (error) providerError(error);
      return;
    }

    // Keep a previously unsubscribed contact suppressed until segment membership succeeds.
    const { error } = await resendRequest((signal) =>
      resend.contacts.segments.add({ contactId: existing.id, segmentId: segment }, { signal }),
    );
    if (error) {
      // Verify membership when Resend rejects adding an already-present contact.
      const memberships = await resendRequest((signal) =>
        resend.contacts.segments.list({ contactId: existing.id, limit: 100 }, { signal }),
      );
      if (!memberships.data?.data.some(({ id }) => id === segment)) providerError(error);
    }
    if (existing.unsubscribed) {
      const { error: updateError } = await resendRequest((signal) =>
        resend.contacts.update({ id: existing.id, unsubscribed: false }, { signal }),
      );
      if (updateError) providerError(updateError);
    }
  }

  return {
    async request(email: string) {
      const key = keyFor(email);
      const saved = await read(key);
      const previous = saved?.data;
      const now = Date.now();
      if (previous?.busyUntil && previous.busyUntil > now) busy();
      if (previous?.status === "confirmed") {
        const contact = await findContact(email);
        if (contact && !contact.unsubscribed) return;
      }

      let entry = previous;
      if (entry?.status !== "pending" || now - entry.requestedAt >= tokenLifetime) {
        entry = { nonce: randomBytes(24).toString("base64url"), requestedAt: now, status: "pending" };
        if (!(await write(key, entry, saved?.etag)).modified) busy();
      }
      const confirmUrl = link("confirm", email, entry.nonce);
      const unsubscribeUrl = link("unsubscribe", email, entry.nonce);
      const content = await renderWelcomeEmail(confirmUrl, unsubscribeUrl, new Date(entry.requestedAt));
      const message = {
        from,
        replyTo,
        to: email,
        subject: "Confirm your subscription to The Monthly Diff",
        ...content,
      };
      // Resend only allows an idempotency key to be reused with the same payload.
      // The confirmation links stay valid when the email content changes.
      const idempotencyKey = `newsletter-welcome/${sign(JSON.stringify(message))}`;
      const { error } = await resendRequest((signal) => sender.emails.send(message, { signal, idempotencyKey }));
      if (error) providerError(error);
    },

    async apply(action: Action, token: string) {
      const [encoded, nonce, signature, extra] = token.split(".");
      const expected = sign(`${action}:${segment}:${encoded}.${nonce}`);
      const badLink = () => new NewsletterError(410, "This link is invalid or has expired. You can request a new one from the homepage.");
      if (extra !== undefined || !encoded || !nonce || !signature || !/^[\w-]{43}$/.test(signature)
        || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw badLink();

      const email = normalizeEmail(Buffer.from(encoded, "base64url").toString());
      if (!email) throw badLink();
      const key = keyFor(email);
      const saved = await read(key);
      if (!saved || saved.data.nonce !== nonce) throw badLink();
      const entry = saved.data;
      if (entry.busyUntil && entry.busyUntil > Date.now()) busy();

      if (action === "confirm") {
        if (entry.status === "confirmed") {
          const contact = await findContact(email);
          if (contact && !contact.unsubscribed) return;
        }
        if (entry.status !== "pending" || Date.now() - entry.requestedAt >= tokenLifetime) throw badLink();
      } else if (entry.status === "unsubscribed") {
        return;
      }

      const lock = await write(key, { ...entry, busyUntil: Date.now() + lockLifetime }, saved.etag);
      if (!lock.etag) busy();
      try {
        if (action === "confirm") await subscribeContact(email);
        if (action === "unsubscribe" && entry.status === "confirmed") {
          const { error } = await resendRequest((signal) =>
            resend.contacts.update({ email, unsubscribed: true }, { signal }),
          );
          if (error && error.statusCode !== 404) providerError(error);
        }
      } catch (error) {
        await write(key, { ...entry, busyUntil: undefined }, lock.etag);
        throw error;
      }
      const status = action === "confirm" ? "confirmed" : "unsubscribed";
      if (!(await write(key, { ...entry, status, busyUntil: undefined }, lock.etag)).modified) busy();
    },
  };
}
