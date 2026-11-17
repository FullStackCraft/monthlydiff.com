export const chapters = [
  { key: "majorReleases", label: "Major Releases" },
  { key: "noteworthyUpdates", label: "Noteworthy Updates" },
  { key: "breakingChanges", label: "Breaking Changes" },
  { key: "graveyard", label: "The Graveyard" },
  { key: "fromTheEditor", label: "From the Editor" },
] as const;

export type ChapterKey = (typeof chapters)[number]["key"];
