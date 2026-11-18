import type { Metadata } from "next";
import { publication } from "./theme";

export const publicPages = {
  home: {
    path: "/",
    markdown: "/md/home",
    title: publication.name,
    description: "A monthly, handwritten, hand-curated newsletter exploring everything that has changed in the software world.",
  },
  calendar: {
    path: "/calendar",
    markdown: "/md/calendar",
    title: "Publication calendar",
    description: "See the month-end publication dates for The Monthly Diff.",
  },
  archive: {
    path: "/issues",
    markdown: "/md/issues",
    title: "Issue archive",
    description: "Browse published issues of The Monthly Diff by month.",
  },
} as const;

export const siteUrl = (path: string) => new URL(path, publication.origin).href;
export const issuePath = (id: string) => `/issues/${id}`;
export const siteId = siteUrl("/#website");
export const periodicalId = siteUrl("/#publication");
export const socialImage = {
  url: siteUrl("/branding/social.png"),
  width: 1200,
  height: 630,
  alt: "The Monthly Diff. Written by human hands. Always.",
};

type PageDetails = {
  path: string;
  markdown: string;
  title: string;
  description: string;
  publishDate?: string;
};

export function publicMetadata({ path, markdown, title, description, publishDate }: PageDetails): Metadata {
  const canonical = siteUrl(path);
  const fullTitle = path === "/" ? title : `${title} | ${publication.name}`;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical,
      types: {
        "text/markdown": siteUrl(markdown),
        "application/rss+xml": [{ url: siteUrl("/rss.xml"), title: publication.name }],
      },
    },
    openGraph: {
      ...(publishDate ? { type: "article", publishedTime: publishDate } as const : { type: "website" } as const),
      url: canonical,
      title: fullTitle,
      description,
      siteName: publication.name,
      locale: "en_US",
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [socialImage],
    },
  };
}
