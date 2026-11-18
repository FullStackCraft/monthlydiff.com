import { publicMetadata, publicPages } from "../../lib/seo";
import Link from "next/link";
import { formatDate, issueNumber } from "../../lib/calendar";
import { listIssueMetadata } from "../../lib/issues";

export const metadata = publicMetadata(publicPages.archive);

export default async function ArchivePage() {
  const issues = await listIssueMetadata();

  return (
    <>
      <header className="page-heading"><h1>Issue archive</h1></header>
      {issues.length === 0 ? (
        <div className="archive-empty">
          <p>No published issues.</p>
          <Link className="text-link" href="/calendar">View publication calendar</Link>
        </div>
      ) : (
        <ul className="issue-list archive-list" role="list">
          {issues.map(({ id, headline, number, publishDate }) => (
            <li key={id}>
              <span>Issue {issueNumber(number)}</span>
              <Link className="text-link" href={`/issues/${id}`}>{headline}</Link>
              <time dateTime={publishDate}>{formatDate(publishDate)}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
