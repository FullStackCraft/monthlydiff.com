import { listIssueMetadata } from "../../lib/issues";
import { issuePath, publicPages, siteUrl } from "../../lib/seo";
import { publication } from "../../lib/theme";

export const dynamic = "force-static";

export async function GET() {
  const issues = await listIssueMetadata();
  const lines = [
    `# ${publication.name}`,
    "",
    `> ${publication.tagline}`,
    "",
    publication.footerTagline,
    "",
    "## Publication",
    "",
    ...Object.values(publicPages).map(({ path, title, markdown, description }) =>
      `- [${title}](${siteUrl(path)}): ${description} [Markdown](${siteUrl(markdown)}).`),
    "- [RSS feed](" + siteUrl("/rss.xml") + ")",
    "",
  ];
  if (issues.length) {
    lines.push("## Published issues", "", ...issues.map(({ id, headline, publishDate }) =>
      `- [${headline}](${siteUrl(issuePath(id))}) (${publishDate})`), "");
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
