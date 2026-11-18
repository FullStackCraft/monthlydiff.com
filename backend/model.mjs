export const columns = [
  { id: "untriaged", label: "Untriaged" },
  { id: "shortlist", label: "Shortlist" },
  { id: "hold", label: "Hold" },
  { id: "skip", label: "Skip" },
  { id: "used", label: "Used" },
];

export const chapterLabels = ["Major Releases", "Noteworthy Updates", "Breaking Changes", "The Graveyard", "From the Editor"];
export const timeZone = "Europe/Vienna";
export const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;
const monthFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit" });
const offsetFormatter = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" });

export function currentMonth(now = new Date()) {
  return monthFormatter.format(now);
}

export function monthBounds(month) {
  if (!monthPattern.test(month)) throw new Error("Choose a month in YYYY-MM format.");
  const [year, number] = month.split("-").map(Number);
  const midnight = (index) => {
    const utc = Date.UTC(year, index, 1);
    const name = offsetFormatter.formatToParts(utc).find((part) => part.type === "timeZoneName").value;
    return utc - Number(name.slice(3)) * 3_600_000;
  };
  return { start: midnight(number - 1), end: midnight(number) };
}
