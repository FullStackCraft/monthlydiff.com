import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/pt-serif/latin-400.css";
import "@fontsource/pt-serif/latin-400-italic.css";
import "@fontsource/pt-serif/latin-700.css";
import { Masthead } from "../components/brand/Masthead";
import { publication, theme } from "../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publication.origin),
  title: { default: publication.name, template: `%s | ${publication.name}` },
  description: publication.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const tokens = Object.entries(theme).map(([name, value]) => `--${name}:${value};`).join("");

  return (
    <html lang="en">
      <body>
        <style>{`:root{${tokens}}`}</style>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header frame">
          <Link href="/" aria-label="The Monthly Diff home" className="home-link">
            <span className="publication-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>Home</span>
          </Link>
          <nav aria-label="Primary">
            <Link href="/calendar">Calendar</Link>
            <Link href="/issues">Archive</Link>
          </nav>
        </header>
        <main id="main" className="frame" tabIndex={-1}>{children}</main>
        <footer className="site-footer frame">
          <Masthead />
          <span>{publication.footerTagline}</span>
        </footer>
      </body>
    </html>
  );
}
