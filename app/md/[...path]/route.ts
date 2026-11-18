import { formatDate, issueNumber, schedule } from "../../../lib/calendar";
import { listIssueMetadata, loadIssue } from "../../../lib/issues";
import { issuePath, publicPages, siteUrl } from "../../../lib/seo";
import { publication } from "../../../lib/theme";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const issues = await listIssueMetadata();
  return [
    ...Object.values(publicPages).map(({ markdown }) => ({ path: [markdown.slice(4)] })),
    ...issues.map(({ id }) => ({ path: ["issues", id] })),
  ];
}

function markdownResponse(path: string, sections: string[]) {
  return new Response(sections.join("\n\n") + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      Link: `<${siteUrl(path)}>; rel="canonical"`,
      Vary: "Accept",
    },
  });
}

function markdownLink(title: string, path: string) {
  return `[${title.replace(/[\\[\]\\\\]/g, "\\$&")}](${siteUrl(path)})`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length === 1 && path[0] === "home") {
    const { home, archive, calendar } = publicPages;
    return markdownResponse(home.path, [
      `# ${home.title}`,
      publication.tagline,
      publication.footerTagline,
      `- ${markdownLink(archive.title, archive.path)}\n- ${markdownLink(calendar.title, calendar.path)}`,
    ]);
  }

  if (path.length === 1 && path[0] === "calendar") {
    const items = await listIssueMetadata();
    const published = new Set(items.map(({ id }) => id));
    return markdownResponse(publicPages.calendar.path, [
      `# ${publicPages.calendar.title}`,
      schedule.map(({ id, number, publishDate }) => {
        const label = `Issue ${issueNumber(number)}`;
        return `- ${published.has(id) ? markdownLink(label, issuePath(id)) : label} · ${formatDate(publishDate)}`;
      }).join("\n"),
    ]);
  }

  if (path[0] === "issues") {
    if (path.length === 1) {
      const issues = await listIssueMetadata();
      return markdownResponse(publicPages.archive.path, [
        `# ${publicPages.archive.title}`,
        issues.map(({ id, headline, publishDate }) =>
          `- ${markdownLink(headline, issuePath(id))} · ${formatDate(publishDate)}`).join("\n") || "No published issues.",
      ]);
    }
    if (path.length === 2) {
      const issue = await loadIssue(path[1]);
      if (issue) {
        return markdownResponse(issuePath(issue.id), [
          `# ${issue.headline}`,
          issue.subtitle,
          `Issue ${issueNumber(issue.number)} · ${formatDate(issue.publishDate)}`,
          ...issue.chapters.map(({ label, markdown }) => `## ${label}\n\n${markdown.trim()}`),
        ]);
      }
    }
  }
  return new Response(null, { status: 404 });
}
