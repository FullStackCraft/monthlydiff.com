import type { CSSProperties } from "react";
import { mastheadAssets, publication, type MastheadPalette } from "../../lib/theme";

export function MastheadFonts() {
  const rules = Object.entries(mastheadAssets).flatMap(([palette, { webFont }]) =>
    webFont
      ? [`@font-face{font-family:PrismCode-${palette};src:url("${webFont}") format("woff2");font-display:swap;}`]
      : [],
  );

  return rules.length > 0 ? <style>{rules.join("\n")}</style> : null;
}

export function Masthead({
  as: Tag = "span",
  palette = "ice",
  className = "",
}: {
  as?: "h1" | "span";
  palette?: MastheadPalette;
  className?: string;
}) {
  const style = mastheadAssets[palette].webFont
    ? ({ "--masthead-font": `PrismCode-${palette}, var(--web-serif)` } as CSSProperties)
    : undefined;

  return <Tag className={`masthead ${className}`} style={style}>{publication.name}</Tag>;
}
