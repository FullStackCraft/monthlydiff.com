"use client";

import { useSyncExternalStore } from "react";
import { publication, seasonalMastheadPalette } from "../../lib/theme";

function subscribeToSeason(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function Masthead({
  as: Tag = "span",
  className = "",
}: {
  as?: "h1" | "span";
  className?: string;
}) {
  // The site is prerendered. Read the live date in the browser so a change
  // of season never needs a rebuild.
  const palette = useSyncExternalStore(subscribeToSeason, seasonalMastheadPalette, () => "sunset");

  return (
    <Tag className={`masthead ${className}`} data-palette={palette}>
      {`<${publication.name}/>`}
    </Tag>
  );
}
