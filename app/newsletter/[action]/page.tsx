import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsletterLink } from "../../../components/NewsletterLink";

export const metadata = {
  title: "Email subscription",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function NewsletterPage({ params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "confirm" && action !== "unsubscribe") notFound();
  return (
    <section className="page-heading newsletter-result">
      <h1>Email subscription</h1>
      <NewsletterLink action={action} />
      <Link href="/" className="text-link">Back to The Monthly Diff</Link>
    </section>
  );
}
