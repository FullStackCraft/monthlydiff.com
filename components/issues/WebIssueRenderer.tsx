import { formatDate, issueNumber } from "../../lib/calendar";
import type { Issue } from "../../lib/issue-schema";
import { Masthead } from "../brand/Masthead";
import { ChapterMarkdown } from "./ChapterMarkdown";

export function WebIssueRenderer({ issue }: { issue: Issue }) {
  return (
    <article className="issue">
      <header className="issue-header">
        <Masthead />
        <p className="issue-kicker">
          Issue {issueNumber(issue.number)} · <time dateTime={issue.publishDate}>{formatDate(issue.publishDate)}</time>
          {issue.isDraft && " · Draft"}
        </p>
        <h1>{issue.headline}</h1>
        <p className="issue-subtitle">{issue.subtitle}</p>
      </header>
      {issue.chapters.map(({ key, label, markdown }) => (
        <section className="issue-chapter" key={key} aria-labelledby={key}>
          <h2 id={key}>{label}</h2>
          <div className="prose"><ChapterMarkdown markdown={markdown} issueId={issue.id} /></div>
        </section>
      ))}
    </article>
  );
}
