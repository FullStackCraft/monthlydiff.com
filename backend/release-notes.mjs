export const changelogPointer = /\b(?:refer to|see|read|consult)\b[^\n]*\bchangelog\b/i;

function taggedChangelog(source, row) {
  if (!source.changelogPath || !row.tag || !changelogPointer.test(row.excerpt)) return null;
  const tag = encodeURIComponent(row.tag);
  const path = source.changelogPath.split("/").map(encodeURIComponent).join("/");
  return {
    raw: `https://raw.githubusercontent.com/${source.repo}/${tag}/${path}`,
    url: `https://github.com/${source.repo}/blob/${tag}/${path}`,
  };
}

export function notesReference(source, row) {
  const configured = source.notesByVersion?.[row.version] ?? taggedChangelog(source, row);
  if (configured || !source.followReleaseNotes) return configured;
  const prefix = `https://github.com/${source.repo}/blob/main/`;
  const url = row.excerpt.match(/\[Release Notes\]\(([^)]+)\)/i)?.[1];
  if (!url?.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  if (!/^release-notes\/[\w.-]+\/[\w.-]+\/[\w.-]+\.md$/.test(path)) return null;
  return { url, raw: `https://raw.githubusercontent.com/${source.repo}/main/${path}`, format: "release" };
}

function description(line) {
  return line
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<xref:([^>?]+)[^>]*>/g, "$1")
    .replace(/\s*\((?:#\d+|[a-f0-9]{7,40})\)/g, "")
    .replace(/\s+PR\s+#\d+\b.*$/i, "")
    .replace(/\s+\\?#\d+(?:\s|$)/g, " ")
    .replace(/\s+by\s+@\S+\s+in\s+https?:\/\/\S+.*$/i, "")
    .replace(/,?\s+(?:closes|fixes)\s+#\d+.*$/i, "")
    .replace(/[\x60*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function releaseHighlights(markdown, preferred = []) {
  const signals = preferred.map((pattern) => new RegExp(pattern, "i"));
  const items = new Map();
  let section = "";
  const text = markdown.replace(/<!--[^]*?-->|\x60\x60\x60[^]*?\x60\x60\x60/g, "");

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^\s*#{1,6}\s+(.+)/);
    if (heading) {
      section = heading[1];
      continue;
    }
    if (/^\s*(?:>|<|\||!\[)|^\s*(?:ENHANCEMENTS|BUG FIXES):\s*$/i.test(line) ||
        /^(?:new contributors|translations|full changelog|downloads?|checksums?|contributors|commits\b)/i.test(section)) continue;
    let change = description(line);
    const preferredIndex = signals.findIndex((pattern) => pattern.test(change));
    if (change.length < 18 && preferredIndex >= 0 && section) change = `${section} · ${change}`;
    if (change.length < 18 || !/[a-z]{3}/i.test(change) || changelogPointer.test(change) ||
        /^(?:https?:\/\/|full changelog|released on|release notes|install instructions|this is a security release|this release contains security fixes|what'?s changed|updated dependencies|thank|see (?:also|the)|source code updates from)/i.test(change) ||
        /^v?\d+\.\d+\.\d+\s*\(/.test(change) || /\[bot\]|update branding to/i.test(change)) continue;

    // A short paragraph can be the main release headline, particularly for a migration.
    const bullet = /^\s*[-*+]\s+/.test(line);
    const breaking = /\b(?:breaking|removed|removes?|no longer|drop support|requires?|is gone|now returns an error)\b/i;
    const security = /\b(?:security|CVE-\d{4}-\d+|GHSA-[\w-]+|vulnerabilit\w*|disclosure|cache leak|poisoning|trustPolicy)\b/i;
    const feature = /\b(?:add|adds|introduc\w*|stabili[sz]\w*|features?)\b/i;
    if (!bullet && !breaking.test(change) && !security.test(change) && !feature.test(change)) continue;
    const score = preferredIndex >= 0 ? 100 - preferredIndex
      : security.test(section) || security.test(change) ? 8
      : breaking.test(section) || breaking.test(change) ? 7
      : feature.test(section) || feature.test(change) ? 4 : 1;
    items.set(change, Math.max(score + Number(bullet), items.get(change) ?? 0));
  }

  return [...items].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([change]) => change);
}

export function clipHighlight(text) {
  if (text.length <= 250) return text;
  const prefix = text.slice(0, 249);
  const wordEnd = prefix.lastIndexOf(" ");
  return `${wordEnd > 0 ? prefix.slice(0, wordEnd) : prefix}…`;
}

function listChanges(markdown) {
  return markdown.split(/\r?\n/).filter((line) => /^[-*+]\s+/.test(line))
    .map(description).filter((line) => line.length >= 12);
}

export function notesFromMarkdown(markdown, row, reference) {
  if (reference.format === "release") return { highlights: releaseHighlights(markdown), excerpt: markdown };
  if (reference.format === "overview") {
    const sections = markdown.split(/^##\s+.+$/gm).slice(1);
    const highlights = reference.highlightPatterns
      ? releaseHighlights(markdown, reference.highlightPatterns)
      : sections.flatMap((section) => listChanges(section).slice(0, 1)).slice(0, 3);
    return { highlights, excerpt: highlights.map((line) => `- ${line}`).join("\n") };
  }

  const headings = [...markdown.matchAll(/^#{1,3}\s+(?:<small>\s*)?\[?v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?=[\]\s(<]|$)[^\n]*/gm)];
  const current = headings.findIndex((heading) => heading[1] === row.version.replace(/^v/, ""));
  if (current === -1) return { highlights: [], excerpt: "" };
  const heading = headings[current];
  const excerpt = markdown.slice(heading.index + heading[0].length, headings[current + 1]?.index).trim();
  const compare = heading[0].match(/\((https:\/\/github\.com\/[^\s)]+\/compare\/[^\s)]+)\)/)?.[1];
  return { highlights: listChanges(excerpt).slice(0, 3), excerpt, compare };
}

export function notesFromComparison(comparison) {
  const bookkeeping = /^(?:(?:release|chore\(release\)):\s*v?\d|bump version\b)/i;
  const commits = (comparison.commits ?? []).map(({ commit }) => description(commit.message.split("\n")[0]));
  const changes = commits.filter((line) => line.length >= 12 && !bookkeeping.test(line) &&
    !/^merge (?:pull request|branch)/i.test(line));
  const highlights = [...new Set(changes)].slice(0, 3);
  if (commits.length === comparison.total_commits && commits.length && commits.every((line) => bookkeeping.test(line))) {
    highlights.push("The changelog entry is empty and the tag comparison shows release bookkeeping only.");
  }
  return { highlights, excerpt: highlights.map((line) => `- ${line}`).join("\n") };
}
