export const publication = {
  name: "The Monthly Diff",
  tagline: "Written by human hands. Always.",
  origin: "https://monthlydiff.com",
};

export const theme = {
  paper: "#f8f5ee",
  ink: "#26221e",
  muted: "#605750",
  line: "#cfc5b8",
  accent: "#884332",
  serif: 'Georgia, "Times New Roman", serif',
  sans: "Arial, Helvetica, sans-serif",
} as const;

// Supply owner-approved PrismCode assets here. Web files must be served from
// public/. Use a publicly reachable HTTPS PNG for email, with its actual width
// and height set to the intended display dimensions (width up to 260px).
interface MastheadAssets {
  webFont?: `/${string}.woff2`;
  emailImage?: { url: `https://${string}`; width: number; height: number };
}

export const mastheadAssets: Record<"ice" | "aurora" | "neon" | "sunset", MastheadAssets> = {
  ice: {},
  aurora: {},
  neon: {},
  sunset: {},
};

export type MastheadPalette = keyof typeof mastheadAssets;

export function isMastheadPalette(value: unknown): value is MastheadPalette {
  return typeof value === "string" && Object.hasOwn(mastheadAssets, value);
}
