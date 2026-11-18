export const publication = {
  name: "The Monthly Diff",
  tagline: "A monthly, handwritten, hand-curated newsletter exploring everything that has changed in the software world. From Rust to React, Python to PHP, TypeScript to TanStack, it's anything and everything you need to know that has changed since last month.",
  footerTagline: "Written by human hands. Always.",
  origin: "https://monthlydiff.com",
  timeZone: "Europe/Vienna",
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

const mastheadPalettes = ["ice", "aurora", "neon", "sunset"] as const;
export type MastheadPalette = (typeof mastheadPalettes)[number];

export function isMastheadPalette(value: unknown): value is MastheadPalette {
  return mastheadPalettes.some((palette) => palette === value);
}

export const emailMastheadSize = { width: 260, height: 36 } as const;

export function emailMastheadPath(palette: MastheadPalette) {
  return `/branding/prismcode-0.1.2/${palette}.png`;
}

const seasonByMonth: readonly MastheadPalette[] = [
  "ice", "ice",
  "aurora", "aurora", "aurora",
  "neon", "neon", "neon",
  "sunset", "sunset", "sunset",
  "ice",
];

const localMonth = new Intl.DateTimeFormat("en-GB", {
  month: "numeric",
  timeZone: publication.timeZone,
});

export function seasonalMastheadPalette(date = new Date()): MastheadPalette {
  return seasonByMonth[Number(localMonth.format(date)) - 1];
}
