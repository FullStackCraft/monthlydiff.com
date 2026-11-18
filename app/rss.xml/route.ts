import { listIssueMetadata } from "../../lib/issues";
import { issuePath, siteUrl } from "../../lib/seo";
import { publication } from "../../lib/theme";

export const dynamic = "force-static";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const issues = await listIssueMetadata();
  const entries = issues.map(({ id, headline, subtitle, publishDate }) => {
    const url = siteUrl(issuePath(id));
    return `    <item>
      <title>${escapeXml(headline)}</title>
      <description>${escapeXml(subtitle)}</description>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${new Date(publishDate).toUTCString()}</pubDate>
    </item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(publication.name)}</title>
    <link>${siteUrl("/")}</link>
    <description>${escapeXml(publication.tagline)}</description>
    <language>en</language>
    <atom:link href="${siteUrl("/rss.xml")}" rel="self" type="application/rss+xml" />
${entries.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
