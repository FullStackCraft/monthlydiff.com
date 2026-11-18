import Link from "next/link";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { Masthead } from "../components/brand/Masthead";
import { formatDate, issueNumber, schedule } from "../lib/calendar";
import { listIssueMetadata } from "../lib/issues";
import { JsonLd } from "../components/seo/JsonLd";
import { periodicalId, publicMetadata, publicPages, siteId, siteUrl } from "../lib/seo";
import { publication } from "../lib/theme";

export const metadata = publicMetadata(publicPages.home);

export default async function HomePage() {
  const [latest] = await listIssueMetadata();
  const featured = latest ?? schedule[0];
  const signupEnabled = process.env.NEWSLETTER_SIGNUP_ENABLED === "true";

  return (
    <div className="home">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": siteId,
            url: siteUrl("/"),
            name: publication.name,
            inLanguage: "en",
            description: publication.tagline,
            about: { "@id": periodicalId },
          },
          {
            "@type": "Periodical",
            "@id": periodicalId,
            url: siteUrl("/"),
            name: publication.name,
            inLanguage: "en",
          },
        ],
      }} />
      <section className="hero" aria-label={publication.name}>
        <Masthead as="h1" className="hero-title" />
        <p className="hero-tagline">{publication.tagline}</p>
      </section>
      <div className="home-details">
        <section aria-labelledby="signup-heading" className="signup">
          <h2 id="signup-heading">Subscribe here:</h2>
          {signupEnabled ? (
            <NewsletterSignup />
          ) : (
            <p className="muted">Sign ups opening shortly</p>
          )}
        </section>
        <section aria-labelledby="featured-heading" className="featured">
          <h2 id="featured-heading">{latest ? "Latest issue" : "Next issue"}</h2>
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
