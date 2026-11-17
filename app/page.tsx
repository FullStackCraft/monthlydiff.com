import Link from "next/link";
import { Masthead } from "../components/brand/Masthead";
import { formatDate, issueNumber, schedule } from "../lib/calendar";
import { listIssueMetadata } from "../lib/issues";
import { publication } from "../lib/theme";

function managedSignupUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    // A missing or invalid hosted form leaves signup closed.
  }
  return null;
}

export default async function HomePage() {
  const [latest] = await listIssueMetadata();
  const featured = latest ?? schedule[0];
  const signupUrl = managedSignupUrl(process.env.SUBSCRIBE_URL);

  return (
    <div className="home">
      <section className="hero" aria-label={publication.name}>
        <Masthead as="h1" className="hero-title" palette={latest?.mastheadPalette} />
        <p className="hero-tagline">{publication.tagline}</p>
      </section>
      <div className="home-details">
        <section aria-labelledby="signup-heading" className="signup">
          <h2 id="signup-heading">Email subscription</h2>
          {signupUrl ? (
            <a className="button" href={signupUrl}>Subscribe <span aria-hidden="true">↗</span></a>
          ) : (
            <p className="muted">Signups closed</p>
          )}
        </section>
        <section aria-labelledby="featured-heading" className="featured">
          <h2 id="featured-heading">{latest ? "Latest issue" : "First issue"}</h2>
          <p className="featured-date">
            <span className="featured-number">{issueNumber(featured.number)}</span>
            <time dateTime={featured.publishDate}>{formatDate(featured.publishDate)}</time>
          </p>
          {latest ? (
            <Link className="text-link" href={`/issues/${latest.id}`}>{latest.headline}</Link>
          ) : (
            <Link className="text-link" href="/calendar">View publication calendar</Link>
          )}
        </section>
      </div>
    </div>
  );
}
