# Publication metadata

- Use the canonical origin from `lib/theme.ts` and the public metadata helpers in `lib/seo.ts`. Keep canonical URLs, social cards, JSON-LD, sitemap, RSS, and Markdown links in sync with changes to the publication or public routes.
- Use `listIssueMetadata()` and `loadIssue()` with their default draft filtering for discovery files and Markdown. Local draft preview belongs on the HTML issue page. A production build must keep drafts out of HTML, page data, feeds, Markdown, and discovery files.
- When changing the social card, verify the published image's URL, dimensions, and alt text. Structured data should describe content that actually appears on the site.
