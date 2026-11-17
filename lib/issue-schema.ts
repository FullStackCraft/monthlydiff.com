import { chapters, type ChapterKey } from "./chapters";
import { isMastheadPalette, type MastheadPalette } from "./theme";

export interface IssueMetadata {
  id: string;
  number: number;
  publishDate: string;
  isDraft: boolean;
  mastheadPalette: MastheadPalette;
  headline: string;
  subtitle: string;
  chapters: Record<ChapterKey, string>;
}

export type Issue = Omit<IssueMetadata, "chapters"> & {
  chapters: Array<{ key: ChapterKey; label: (typeof chapters)[number]["label"]; markdown: string }>;
};

export const issueIdPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validateIssueMetadata(value: unknown, folder: string): IssueMetadata {
  function invalid(field: string): never {
    throw new Error(`Invalid ${field} in content/issues/${folder}/issue.yaml`);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("metadata");
  const data = value as Record<string, unknown>;
  const { id, number, publishDate, isDraft, mastheadPalette, headline, subtitle } = data;

  if (typeof id !== "string" || id !== folder || !issueIdPattern.test(id)) invalid("id");
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
    invalid("number");
  }
  if (typeof publishDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
    invalid("publishDate");
  }
  const date = new Date(`${publishDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== publishDate) {
    invalid("publishDate");
  }
  if (typeof isDraft !== "boolean") invalid("isDraft");
  if (!isMastheadPalette(mastheadPalette)) invalid("mastheadPalette");
  if (typeof headline !== "string" || !headline.trim()) invalid("headline");
  if (typeof subtitle !== "string" || !subtitle.trim()) invalid("subtitle");

  const files = data.chapters;
  if (!files || typeof files !== "object" || Array.isArray(files)) invalid("chapters");

  const map = files as Record<string, unknown>;
  if (Object.keys(map).length !== chapters.length) invalid("chapters");
  const entries = chapters.map(({ key }) => {
    const filename = map[key];
    if (typeof filename !== "string" || !/^[a-z0-9][a-z0-9-]*\.md$/.test(filename)) {
      invalid(`chapters.${key}`);
    }
    return [key, filename] as const;
  });
  if (new Set(entries.map(([, filename]) => filename)).size !== chapters.length) {
    invalid("chapters (duplicate filenames)");
  }

  return {
    id,
    number,
    publishDate,
    isDraft,
    mastheadPalette,
    headline,
    subtitle,
    chapters: Object.fromEntries(entries) as IssueMetadata["chapters"],
  };
}
