import type { MetadataRoute } from "next";
import { listIssueMetadata } from "../lib/issues";
import { issuePath, publicPages, siteUrl } from "../lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await listIssueMetadata();
  return [
    ...Object.values(publicPages).map(({ path }) => ({ url: siteUrl(path) })),
    ...issues.map(({ id, publishDate }) => ({
      url: siteUrl(issuePath(id)),
      lastModified: publishDate,
    })),
  ];
}
