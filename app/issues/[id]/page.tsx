import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "../../../components/seo/JsonLd";
import { issuePath, periodicalId, publicMetadata, siteId, siteUrl, socialImage } from "../../../lib/seo";
import { WebIssueRenderer } from "../../../components/issues/WebIssueRenderer";
import { listIssueMetadata, loadIssue } from "../../../lib/issues";

const includeDraft = process.env.NODE_ENV === "development";

export async function generateStaticParams() {
  return (await listIssueMetadata({ includeDraft })).map(({ id }) => ({ id }));
}

const getIssue = cache(async (id: string) => {
  // Netlify can forward unmatched paths to this route. Reject them here even
  // when the deployment has no published issues.
  const issue = await loadIssue(id, { includeDraft });
  if (!issue) notFound();
  return issue;
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const issue = await getIssue((await params).id);
  if (issue.isDraft) {
    return { title: issue.headline, robots: { index: false, follow: false } };
  }
  const path = issuePath(issue.id);
  return publicMetadata({
    path,
    markdown: `/md${path}`,
    title: issue.headline,
    description: issue.subtitle,
    publishDate: issue.publishDate,
  });
}

export default async function IssuePage({ params }: Props) {
  const issue = await getIssue((await params).id);
  const url = siteUrl(issuePath(issue.id));

  return (
    <>
      {!issue.isDraft && <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": `${url}#article`,
        url,
        headline: issue.headline,
        description: issue.subtitle,
        datePublished: issue.publishDate,
        inLanguage: "en",
        image: socialImage.url,
        mainEntityOfPage: { "@id": url },
        isPartOf: [{ "@id": siteId }, { "@id": periodicalId }],
      }} />}
      <WebIssueRenderer issue={issue} />
    </>
  );
}
