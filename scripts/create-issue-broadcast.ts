import { parseArgs } from "node:util";
import { Resend } from "resend";
import { renderIssueEmail } from "../components/email/render-issue-email";
import { issueIdPattern } from "../lib/issue-schema";
import { loadIssue } from "../lib/issues";
import { issueNumber } from "../lib/calendar";

async function main() {
  const { values: { issue: id } } = parseArgs({ options: { issue: { type: "string" } } });
  if (!id || !issueIdPattern.test(id)) throw new Error("Usage: npm run email:broadcast -- --issue YYYY-MM");
  const issue = await loadIssue(id, { includeDraft: false });
  if (!issue) throw new Error("No published issue matches that ID.");

  const apiKey = process.env.RESEND_CONTACTS_API_KEY?.trim();
  const from = (process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL)?.trim();
  const replyTo = process.env.RESEND_REPLY_TO?.trim() || undefined;
  const segmentId = process.env.RESEND_SEGMENT_ID?.trim();
  if (!apiKey || !from || !segmentId) throw new Error("Set RESEND_CONTACTS_API_KEY, RESEND_FROM and RESEND_SEGMENT_ID.");

  const resend = new Resend(apiKey);
  const unsubscribe = "{{{RESEND_UNSUBSCRIBE_URL}}}";
  const { html, text } = await renderIssueEmail(issue, undefined, unsubscribe);
  const { data, error } = await resend.broadcasts.create({
    name: `The Monthly Diff · Issue ${issueNumber(issue.number)} (${id})`,
    subject: issue.headline.replace(/[\r\n]+/g, " "),
    previewText: issue.subtitle,
    from,
    replyTo,
    segmentId,
    html,
    text,
    send: false,
  });
  if (error) throw new Error(error.message);
  console.log(`Resend broadcast draft: https://resend.com/broadcasts/${data.id}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
