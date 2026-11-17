import type { Metadata } from "next";
import Link from "next/link";
import { YearCalendar } from "../../components/calendar/YearCalendar";
import { calendarYear, formatDate, issueNumber, schedule } from "../../lib/calendar";
import { listIssueMetadata } from "../../lib/issues";

export const metadata: Metadata = { title: "Publication calendar" };

export default async function CalendarPage() {
  const publishedIds = new Set((await listIssueMetadata()).map(({ id }) => id));

  return (
    <>
      <header className="page-heading">
        <h1>{calendarYear} publication calendar</h1>
        <p className="calendar-key"><span className="calendar-ring" aria-hidden="true" /> Publication day</p>
      </header>
      <YearCalendar />
      <section className="schedule" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Issue schedule</h2>
        <ol className="issue-list" role="list">
          {schedule.map(({ id, number, publishDate }) => {
            const published = publishedIds.has(id);
            const label = `Issue ${issueNumber(number)}`;
            return (
              <li key={id}>
                {published ? <Link className="text-link" href={`/issues/${id}`}>{label}</Link> : <span>{label}</span>}
                <time dateTime={publishDate}>{formatDate(publishDate)}</time>
                <span className="issue-status">{published ? "Published" : "Scheduled"}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
