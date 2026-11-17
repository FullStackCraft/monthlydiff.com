import { render, toPlainText } from "react-email";
import type { Issue } from "../../lib/issue-schema";
import { mastheadAssets } from "../../lib/theme";
import { EmailIssueRenderer } from "./EmailIssueRenderer";

export async function renderIssueEmail(issue: Issue) {
  const html = await render(<EmailIssueRenderer issue={issue} />);
  const textSource = mastheadAssets[issue.mastheadPalette].emailImage
    ? await render(<EmailIssueRenderer issue={issue} textMasthead />)
    : html;
  const text = toPlainText(textSource, {
    selectors: ["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({
      selector,
      options: { uppercase: false },
    })),
  });
  return { html, text };
}
