import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { chapters } from "./chapters";
import { issueIdPattern, validateIssueMetadata, type Issue } from "./issue-schema";

const issuesDirectory = join(process.cwd(), "content", "issues");

async function readMetadata(id: string) {
  const yaml = await readFile(join(issuesDirectory, id, "issue.yaml"), "utf8");
  return validateIssueMetadata(parse(yaml, { maxAliasCount: 0 }), id);
}

export async function listIssueMetadata({ includeDraft = false } = {}) {
  const folders = await readdir(issuesDirectory, { withFileTypes: true });
  const issues = await Promise.all(
    folders
      .filter((entry) => entry.isDirectory() && issueIdPattern.test(entry.name))
      .map((entry) => readMetadata(entry.name)),
  );

  return issues
    .filter((issue) => includeDraft || !issue.isDraft)
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate) || b.number - a.number);
}

export async function loadIssue(id: string, { includeDraft = false } = {}): Promise<Issue | null> {
  if (!issueIdPattern.test(id)) return null;

  const metadata = await readMetadata(id).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });

  if (!metadata || (metadata.isDraft && !includeDraft)) return null;

  return {
    ...metadata,
    chapters: await Promise.all(
      chapters.map(async ({ key, label }) => ({
        key,
        label,
        markdown: await readFile(join(issuesDirectory, id, metadata.chapters[key]), "utf8"),
      })),
    ),
  };
}
