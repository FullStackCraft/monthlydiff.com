import { parseArgs } from "node:util";
import { Resend } from "resend";
import { renderIssueEmail } from "../components/email/render-issue-email";
import { issueIdPattern } from "../lib/issue-schema";
import { loadIssue } from "../lib/issues";

const recipients = [
  "frewin.christopher@gmail.com",
  "frewin.christopher@outlook.com",
  "razzzmatttazzz@hotmail.com",
] as const;

async function main() {
  const { values: { issue: id, to } } = parseArgs({
    options: { issue: { type: "string" }, to: { type: "string" } },
  });

  if (!id || !issueIdPattern.test(id)) {
    throw new Error("Usage: npm run email:test -- --issue YYYY-MM [--to allowlisted-address]");
  }

  const recipient = to === undefined ? undefined : recipients.find((email) => email === to.trim().toLowerCase());
  if (to !== undefined && !recipient) throw new Error("Recipient is outside the test allowlist.");

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error("Set RESEND_API_KEY and RESEND_FROM_EMAIL to a verified Resend sender.");
  }
  // From is a single bare address. Resend enforces ownership of its sending domain.
  if (!/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(from) || from.toLowerCase().endsWith("@resend.dev")) {
    throw new Error("RESEND_FROM_EMAIL must be an address at your verified sending domain.");
  }

  const issue = await loadIssue(id, { includeDraft: true });
  if (!issue) throw new Error(`Issue ${id} was not found.`);

  const { html, text } = await renderIssueEmail(issue);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: recipient ? [recipient] : [...recipients],
    subject: `[TEST] ${issue.headline.replace(/[\r\n]+/g, " ")}`,
    html,
    text,
  });
  if (error) throw new Error(error.message);
  console.log(`Resend accepted test email ${data?.id}.`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
