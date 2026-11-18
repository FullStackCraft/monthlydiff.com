import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { Resend } from "resend";
import { createNewsletter } from "../lib/newsletter";
import { renderIssueEmail } from "../components/email/render-issue-email";
import { loadIssue } from "../lib/issues";

test("welcome link confirms once, unsubscribe suppresses delivery, and a fresh opt-in can resubscribe", async (t) => {
  type StoredSignup = NonNullable<Awaited<ReturnType<Parameters<typeof createNewsletter>[0]["store"]["getWithMetadata"]>>>;
  const blobs = new Map<string, StoredSignup>();
  let etag = 0;
  const sent = new Map<string, { html: string; text: string }>();
  let contact: { id: string; email: string; unsubscribed: boolean } | undefined;
  let segments: { id: string }[] = [];
  const api = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk.toString();
    const body = raw ? JSON.parse(raw) : undefined;
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/emails" && req.method === "POST") {
      const key = req.headers["idempotency-key"];
      assert.equal(typeof key, "string");
      const previous = sent.get(key as string);
      if (previous && JSON.stringify(previous) !== JSON.stringify(body)) {
        return respond(409, { name: "invalid_idempotent_request", statusCode: 409 });
      }
      if (!previous) sent.set(key as string, body);
      return respond(200, { id: key });
    }
    if (req.url === "/contacts" && req.method === "POST") {
      contact = { id: "contact-id", email: body.email, unsubscribed: body.unsubscribed };
      segments = body.segments;
      return respond(200, { id: contact.id });
    }
    if (req.method === "GET" && req.url?.startsWith("/contacts/")) {
      return contact ? respond(200, contact) : respond(404, { name: "not_found", message: "No contact", statusCode: 404 });
    }
    if (req.method === "PATCH" && req.url?.startsWith("/contacts/") && contact) {
      contact.unsubscribed = body.unsubscribed;
      return respond(200, { id: contact.id });
    }
    if (req.method === "POST" && req.url === "/contacts/contact-id/segments/newsletter-list") {
      assert.deepEqual(segments, [{ id: "newsletter-list" }]);
      return respond(200, { id: "newsletter-list" });
    }
    return respond(400, { name: "validation_error", message: `Unexpected ${req.method} ${req.url}` });
  });
  api.listen(0, "127.0.0.1");
  t.after(() => api.close());
  await once(api, "listening");
  const address = api.address();
  assert.ok(address && typeof address !== "string");
  const resend = new Resend("fixture", { baseUrl: `http://127.0.0.1:${address.port}` });
  const settings: Parameters<typeof createNewsletter>[0] = {
    secret: "fixture-secret",
    segment: "newsletter-list",
    origin: "https://monthlydiff.com",
    from: "The Monthly Diff <fixture@example.com>",
    resend,
    sender: resend,
    store: {
      async getWithMetadata(key) { return blobs.get(key) ?? null; },
      async setJSON(key, data, options) {
        if ((options?.onlyIfNew && blobs.has(key)) ||
            (options?.onlyIfMatch && options.onlyIfMatch !== blobs.get(key)?.etag)) return { modified: false };
        const next = { data, etag: String(++etag) };
        blobs.set(key, next);
        return { modified: true, etag: next.etag };
      },
    },
  };
  const newsletter = createNewsletter(settings);
  const email = "reader@example.com";
  const token = (text: string, action: string) => {
    const link = text.match(new RegExp(`https://monthlydiff\\.com/newsletter/${action}#[^\\s]+`));
    assert.ok(link);
    return new URL(link[0]).hash.slice(1);
  };

  await newsletter.request(email);
  await newsletter.request(email);
  assert.equal(contact, undefined);
  assert.equal(sent.size, 1);
  const first = [...sent.values()][0];
  assert.match(first.html, /Confirm subscription/);
  const updatedNewsletter = createNewsletter({ ...settings, replyTo: "editor@example.com" });
  await updatedNewsletter.request(email);
  await updatedNewsletter.request(email);
  assert.equal(sent.size, 2);
  assert.equal([...sent.values()][1].text, first.text);
  const confirm = token(first.text, "confirm");
  const unsubscribe = token(first.text, "unsubscribe");
  await assert.rejects(newsletter.apply("confirm", unsubscribe), { status: 410 });
  await newsletter.apply("confirm", confirm);
  await newsletter.apply("confirm", confirm);
  assert.deepEqual(segments, [{ id: "newsletter-list" }]);
  assert.equal(contact!.unsubscribed, false);
  await newsletter.apply("unsubscribe", unsubscribe);
  await newsletter.apply("unsubscribe", unsubscribe);
  assert.equal(contact!.unsubscribed, true);
  await assert.rejects(newsletter.apply("confirm", confirm), { status: 410 });

  await newsletter.request(email);
  const second = [...sent.values()][2];
  const secondConfirm = token(second.text, "confirm");
  await newsletter.apply("confirm", secondConfirm);
  assert.equal(contact!.unsubscribed, false);
  // A provider-managed Broadcast unsubscribe also invalidates confirmation replay.
  contact!.unsubscribed = true;
  await assert.rejects(newsletter.apply("confirm", secondConfirm), { status: 410 });

  await newsletter.request(email);
  const third = [...sent.values()][3];
  await newsletter.apply("unsubscribe", token(third.text, "unsubscribe"));
  await assert.rejects(newsletter.apply("confirm", token(third.text, "confirm")), { status: 410 });
  assert.equal(contact!.unsubscribed, true);
});

test("issue broadcasts retain Resend's unsubscribe placeholder in HTML and plain text", async () => {
  const issue = await loadIssue("2027-01", { includeDraft: true });
  assert.ok(issue);
  const placeholder = "{{{RESEND_UNSUBSCRIBE_URL}}}";
  const { html, text } = await renderIssueEmail(issue, undefined, placeholder);
  assert.ok(html.includes(`href="${placeholder}"`));
  assert.ok(text.includes(placeholder));
});
