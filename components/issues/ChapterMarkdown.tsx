import Markdown, { sanitizer } from "markdown-to-jsx/react";
import type { CSSProperties } from "react";
import { publication, theme } from "../../lib/theme";

const headingStyle: CSSProperties = {
  fontFamily: theme.serif,
  fontSize: 18,
  lineHeight: "24px",
  margin: "16px 0 8px",
};

const emailStyles = {
  p: { props: { style: { margin: "0 0 12px" } } },
  a: { props: { style: { color: theme.accent, textDecoration: "underline" } } },
  ul: { props: { style: { margin: "0 0 12px", paddingLeft: 24 } } },
  ol: { props: { style: { margin: "0 0 12px", paddingLeft: 24 } } },
  code: { props: { style: { fontFamily: '"Courier New", monospace', fontSize: 14 } } },
};

export function ChapterMarkdown({
  markdown,
  issueId,
  email = false,
}: {
  markdown: string;
  issueId: string;
  email?: boolean;
}) {
  const base = `${publication.origin}/issues/${issueId}`;
  const heading = (component: "h3" | "h4" | "h5" | "h6") => ({
    component,
    ...(email && { props: { style: headingStyle } }),
  });

  return (
    <Markdown
      options={{
        forceBlock: true,
        wrapper: null,
        disableParsingRawHTML: true,
        ignoreHTMLBlocks: true,
        overrides: {
          h1: heading("h3"),
          h2: heading("h4"),
          h3: heading("h5"),
          h4: heading("h6"),
          h5: heading("h6"),
          h6: heading("h6"),
          ...(email && emailStyles),
        },
        sanitizer(value) {
          const safeValue = sanitizer(value);
          if (!safeValue) return null;
          try {
            const url = new URL(safeValue, base);
            if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
            return email ? url.href : safeValue;
          } catch {
            return null;
          }
        },
      }}
    >
      {markdown}
    </Markdown>
  );
}
