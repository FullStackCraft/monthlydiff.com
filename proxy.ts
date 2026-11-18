import { NextResponse, type NextRequest } from "next/server";
import { issueIdPattern } from "./lib/issue-schema";

function acceptsMarkdown(accept: string) {
  let markdown = 0;
  let html = 0;
  for (const range of accept.toLowerCase().split(",")) {
    const [type, ...params] = range.trim().split(";").map((part) => part.trim());
    const quality = Number(params.find((param) => param.startsWith("q="))?.slice(2) ?? 1);
    if (!(quality >= 0 && quality <= 1)) continue;
    if (type === "text/markdown") markdown = Math.max(markdown, quality);
    if (type === "text/html") html = Math.max(html, quality);
  }
  return markdown > 0 && markdown >= html;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/issues/") && !issueIdPattern.test(pathname.slice("/issues/".length))) {
    return NextResponse.next();
  }

  const markdown = ["GET", "HEAD"].includes(request.method) && acceptsMarkdown(request.headers.get("accept") ?? "");
  if (!markdown) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = pathname === "/" ? "/md/home" : `/md${pathname}`;
  const response = NextResponse.rewrite(destination);
  // Keep the alternate representation out of Netlify's shared HTML cache.
  response.headers.set("Netlify-CDN-Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/", "/calendar", "/issues", "/issues/:id"] };
