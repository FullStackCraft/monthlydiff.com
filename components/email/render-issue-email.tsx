import { render, toPlainText } from "react-email";
import type { Issue } from "../../lib/issue-schema";
import { EmailIssueRenderer } from "./EmailIssueRenderer";

export async function renderIssueEmail(issue: Issue, mastheadSrc?: string) {
  const [html, textSource] = await Promise.all([
    render(<EmailIssueRenderer issue={issue} mastheadSrc={mastheadSrc} />),
    render(<EmailIssueRenderer issue={issue} textMasthead />),
  ]);
  const text = toPlainText(textSource, {
    selectors: ["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({
      selector,
      options: { uppercase: false },
    })),
  });
  return { html, text };
}
