import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
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
  return {
    title: issue.headline,
    description: issue.subtitle,
    ...(issue.isDraft && { robots: { index: false, follow: false } }),
  };
}

export default async function IssuePage({ params }: Props) {
  return <WebIssueRenderer issue={await getIssue((await params).id)} />;
}
