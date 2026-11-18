import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { backendDir, openDb, transaction } from "./db.mjs";
import { currentMonth, monthBounds } from "./model.mjs";
import { changelogPointer, clipHighlight, notesFromComparison, notesFromMarkdown, notesReference, releaseHighlights } from "./release-notes.mjs";

export const hour = 3_600_000;
export const cadence = 6 * hour;
const leaseTime = 90_000;
const cacheVersion = 6;
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false });

export function readSources() {
  const list = JSON.parse(readFileSync(process.env.MONTHLYDIFF_SOURCES || join(backendDir, "sources.json"), "utf8"));
  if (!Array.isArray(list)) throw new Error("The source list must be a JSON array.");
  const seen = new Set();
  return list.map((source) => {
    if (!source.project?.trim() || !source.ecosystem?.trim() ||
      (!/^[\w.-]+\/[\w.-]+$/.test(source.repo ?? "") && !source.feed)) {
      throw new Error("Each source needs a project, ecosystem and GitHub repo or HTTPS feed.");
    }
    const url = source.repo
      ? `https://api.github.com/repos/${source.repo}/releases?per_page=100`
      : new URL(source.feed).href;
    if (new URL(url).protocol !== "https:" || seen.has(url.toLowerCase())) {
      throw new Error("Sources need unique HTTPS URLs.");
    }
    if (source.match) new RegExp(source.match, "i");
    seen.add(url.toLowerCase());
    return { ...source, url, key: source.repo?.toLowerCase() ?? url };
  });
}

function githubToken() {
  const explicit = process.env.MONTHLYDIFF_GITHUB_TOKEN;
  if (explicit) return explicit;
  try {
    return execFileSync("gh", ["auth", "token", "--hostname", "github.com"], {
      encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function httpUrl(value, base) {
  try {
    if (typeof value !== "string" || !value) return "";
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function textOf(value) {
  if (typeof value === "string") return value;
  return value?.["#text"] ?? "";
}

function plain(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/^[\s#>*-]+|[\s*]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickHook(title, excerpt) {
  const lines = excerpt.replace(/<!--[^]*?-->/g, "").replace(/```[^]*?```/g, "").split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .map(plain)
    .filter((line) => line.length >= 22 && /[a-z]{3}/i.test(line) &&
      !/^https?:\/\//i.test(line) &&
      !changelogPointer.test(line) &&
      !/^(full change(log|\s*log)|change(log|s)\b|what['’]?s changed|contributors?|release notes|see (the|also)|thank|compare|checksums?|installation|sha256|release of)\b/i.test(line) &&
      !/\[bot\]|source code updates from|update branding to/i.test(line));
  const concreteTitle = plain(title);
  const usefulTitle = concreteTitle.length >= 22 && /[a-z]{3}/i.test(concreteTitle) &&
    !/\b(?:release|version|v)?\s*\d+\.\d+[.\w-]*\s*$/i.test(concreteTitle);
  const hook = usefulTitle ? concreteTitle : lines[0];
  return { hook: hook ? hook.slice(0, 250) : "Review the upstream notes for the key change.", needsReview: !hook };
}

function normalized(source, { id, version, title, body, url, timestamp }) {
  const link = httpUrl(url, source.url);
  const published = Date.parse(timestamp);
  if (!id || !link || !Number.isFinite(published)) return null;
  if (source.match && !new RegExp(source.match, "i").test(`${version} ${title}`)) return null;
  const name = (version || title || "Release").trim();
  const canonical = (version || "").trim().replace(/^v(?=\d)/i, "").toLowerCase();
  const identity = canonical ? `version:${source.track ?? ""}:${canonical}` : `url:${link}`;
  const releaseBody = String(body ?? "").trim();
  const excerpt = releaseBody.slice(0, 2400);
  const highlights = releaseHighlights(releaseBody, source.highlightPatterns).map(clipHighlight);
  return { id: String(id), identity, version: name.slice(0, 120), url: link, published,
    excerpt, highlights, ...pickHook(title, excerpt), priority: source.repo ? 2 : 1 };
}

function githubPage(source, items, headers) {
  if (!Array.isArray(items)) throw new Error("GitHub returned an unexpected release list.");
  const dates = items.flatMap((item) => {
    const date = Date.parse(item.published_at || item.created_at);
    return Number.isFinite(date) ? [date] : [];
  });
  const rows = items.flatMap((item) => {
    if (item.draft || (!source.prereleases && item.prerelease) ||
        (source.tagPrefix && !item.tag_name?.startsWith(source.tagPrefix))) return [];
    const result = normalized(source, {
      id: item.id,
      version: item.tag_name?.slice(source.tagPrefix?.length ?? 0),
      title: item.name,
      body: item.body,
      url: item.html_url,
      timestamp: item.published_at,
    });
    return result ? [{ ...result, tag: item.tag_name }] : [];
  });
  const next = headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  if (next && new URL(next).origin !== "https://api.github.com") throw new Error("Unexpected GitHub pagination URL.");
  return { rows, dates, next };
}

function feedPage(source, xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("The feed contains unsupported XML declarations.");
  const parsed = parser.parse(xml);
  const root = parsed.rss?.channel ?? parsed.feed ?? parsed["rdf:RDF"];
  if (!root) throw new Error("Expected an RSS or Atom feed.");
  const entries = [root.item ?? root.entry ?? []].flat();
  const dates = [];
  const rows = [];
  for (const item of entries) {
    const title = textOf(item.title);
    const links = [item.link ?? []].flat();
    const link = links.find((entry) => entry["@_rel"] === "alternate") ?? links[0];
    const url = typeof link === "string" ? link : link?.["@_href"] ?? textOf(link);
    const timestamp = item.pubDate ?? item.published ?? item.updated ?? item["dc:date"];
    const date = Date.parse(timestamp);
    if (Number.isFinite(date)) dates.push(date);
    const candidate = normalized(source, {
      id: textOf(item.guid ?? item.id) || url,
      version: title.match(/\bv?(\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?)/i)?.[1],
      title, body: textOf(item.summary ?? item.description ?? item.content),
      url, timestamp,
    });
    if (candidate) rows.push(candidate);
  }
  return { rows, dates, next: null };
}

class FetchError extends Error {
  constructor(message, { waitUntil = 0, blocked = false } = {}) {
    super(message);
    this.waitUntil = waitUntil;
    this.blocked = blocked;
  }
}

function failure(response, now) {
  const retry = response.headers.get("retry-after");
  const exhausted = response.headers.get("x-ratelimit-remaining") === "0";
  const retryAt = retry === null ? 0 : /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry) || 0;
  const reset = exhausted ? Number(response.headers.get("x-ratelimit-reset")) * 1000 : 0;
  const rateLimited = response.status === 429 || exhausted || retry !== null;
  const blocked = response.status >= 400 && response.status < 500 && !rateLimited && ![408, 425].includes(response.status);
  return new FetchError(`HTTP ${response.status}${rateLimited ? " · rate limited" : ""}`, {
    waitUntil: Math.max(retryAt, reset), blocked,
  });
}

async function enrichRelease(db, source, row, token, fetcher) {
  const reference = notesReference(source, row);
  if (!reference) return null;
  const cached = db.prepare("SELECT * FROM pages WHERE source=? AND url=?").get(source.key, reference.raw);
  const cachedNotes = cached ? JSON.parse(cached.payload) : null;
  const cacheIsCurrent = cachedNotes?.version === cacheVersion;
  const headers = { "User-Agent": "The-Monthly-Diff-Local-Collector" };
  if (cacheIsCurrent && cached.etag) headers["If-None-Match"] = cached.etag;
  const response = await fetcher(reference.raw, { headers, signal: AbortSignal.timeout(8_000) });
  if (response.status === 304 && cacheIsCurrent) return { notes: cachedNotes, page: cached };
  if (!response.ok) return null;

  let notes = { ...notesFromMarkdown(await response.text(), row, reference), url: reference.url };
  if (!notes.highlights.length && notes.compare) {
    const range = notes.compare.slice(`https://github.com/${source.repo}/compare/`.length);
    if (notes.compare.startsWith(`https://github.com/${source.repo}/compare/`) &&
        range.endsWith(`...${row.tag}`) && /^[\w.-]+\.\.\.[\w.-]+$/.test(range)) {
      const apiHeaders = { "User-Agent": headers["User-Agent"], Accept: "application/vnd.github+json" };
      if (token) apiHeaders.Authorization = `Bearer ${token}`;
      const comparison = await fetcher(`https://api.github.com/repos/${source.repo}/compare/${range}`,
        { headers: apiHeaders, signal: AbortSignal.timeout(8_000) });
      if (comparison.ok) notes = { ...notesFromComparison(await comparison.json()), url: notes.compare };
    }
  }
  if (!notes.highlights.length) return null;
  notes.excerpt = notes.excerpt.slice(0, 2400);
  notes.highlights = notes.highlights.map(clipHighlight);
  return { notes, page: { url: reference.raw, etag: response.headers.get("etag"),
    modified: null, payload: JSON.stringify({ ...notes, version: cacheVersion }) } };
}

async function collectSource(db, source, start, end, token, fetcher, clock) {
  let url = source.url;
  const pages = [];
  const rows = [];
  let earliest = Infinity;
  while (url) {
    if (pages.length >= 80 || pages.some((page) => page.url === url)) {
      throw new FetchError("Pagination could not complete the requested window.");
    }
    const cached = db.prepare("SELECT * FROM pages WHERE source=? AND url=?").get(source.key, url);
    const cachedPayload = cached ? JSON.parse(cached.payload) : null;
    const usableCache = cachedPayload?.version === cacheVersion ? cached : null;
    const headers = { "User-Agent": "The-Monthly-Diff-Local-Collector" };
    if (source.repo) {
      headers.Accept = "application/vnd.github+json";
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (usableCache?.etag) headers["If-None-Match"] = usableCache.etag;
    if (usableCache?.modified) headers["If-Modified-Since"] = usableCache.modified;
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(12_000) });
    let payload;
    if (response.status === 304 && usableCache) {
      payload = cachedPayload;
      pages.push(usableCache);
    } else {
      if (!response.ok) throw failure(response, clock());
      payload = source.repo
        ? githubPage(source, await response.json(), response.headers)
        : feedPage(source, await response.text());
      pages.push({ url, etag: response.headers.get("etag"),
        modified: response.headers.get("last-modified"), payload: JSON.stringify({ ...payload, version: cacheVersion }) });
    }
    earliest = Math.min(earliest, ...payload.dates);
    rows.push(...payload.rows.filter((row) => row.published >= start && row.published < end));
    // Walk a whole older page before stopping. Mixed stable and prerelease
    // streams and maintained older branches can put older records earlier.
    url = payload.dates.length && payload.dates.every((date) => date < start) ? null : payload.next;
  }
  const gap = !source.repo && earliest > start
    ? "This feed does not establish coverage back to the start of the window."
    : null;
  for (const row of rows) {
    try {
      const enrichment = await enrichRelease(db, source, row, token, fetcher);
      if (!enrichment) continue;
      row.notes = enrichment.notes;
      pages.push(enrichment.page);
    } catch {
      // Store the release even if its optional notes are temporarily unavailable.
      // An existing good enrichment stays attached and the next sync retries it.
    }
  }
  return { rows, pages, gap };
}

function storeRelease(db, source, row, discovered) {
  const known = db.prepare("SELECT release_id FROM upstream_ids WHERE source=? AND upstream_id=?").get(source.key, row.id);
  let release = known
    ? db.prepare("SELECT id, priority FROM releases WHERE id=?").get(known.release_id)
    : db.prepare("SELECT id, priority FROM releases WHERE project=? AND identity=?").get(source.project, row.identity);
  const values = [row.version, source.ecosystem, row.published, row.url, row.hook, Number(row.needsReview), row.excerpt, row.priority];
  if (!release) {
    release = db.prepare(`INSERT INTO releases(project,identity,discovered,version,ecosystem,published,url,hook,needs_review,excerpt,priority)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(source.project, row.identity, discovered, ...values);
  } else if (row.priority >= release.priority) {
    db.prepare(`UPDATE releases SET version=?,ecosystem=?,published=?,url=?,hook=?,needs_review=?,excerpt=?,priority=? WHERE id=?`)
      .run(...values, release.id);
  }
  db.prepare("INSERT OR IGNORE INTO upstream_ids VALUES(?,?,?)").run(source.key, row.id, release.id);
  const notes = row.notes ?? { url: row.url, highlights: row.highlights, excerpt: row.excerpt };
  if (notes.highlights.length) {
    db.prepare(`INSERT INTO release_notes VALUES(?,?,?,?) ON CONFLICT(release_id) DO UPDATE SET
      url=excluded.url, highlights=excluded.highlights, excerpt=excluded.excerpt
      WHERE ? OR release_notes.url = excluded.url`)
      .run(release.id, notes.url, JSON.stringify(notes.highlights), notes.excerpt, Number(Boolean(row.notes)));
  }
}

export async function sync({
  month, manual = false, fetcher = fetch, clock = Date.now, sources = readSources(),
  dbPath, token, log = () => {},
} = {}) {
  const now = clock();
  const current = currentMonth(new Date(now));
  const selected = month ?? current;
  const { start, end } = monthBounds(selected);
  const upTo = Math.min(now, end);
  if (start >= upTo) throw new Error("There is no release history yet for this month.");
  const db = openDb(dbPath);
  const owner = randomUUID();
  const acquired = db.prepare(`INSERT INTO sync_lock(id,owner,expires,month) VALUES(1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires,
    month=excluded.month,progress='' WHERE sync_lock.expires <= ?`).run(owner, now + leaseTime, selected, now).changes;
  if (!acquired) {
    db.close();
    return { busy: true, ok: 0, failed: 0 };
  }

  function renew(progress) {
    const result = db.prepare("UPDATE sync_lock SET expires=?,progress=? WHERE owner=?")
      .run(clock() + leaseTime, progress, owner);
    if (!result.changes) throw new Error("Another collector took over this run.");
  }

  let ok = 0;
  let failed = 0;
  let progress = "";
  const heartbeat = setInterval(() => {
    try {
      renew(progress);
    } catch {
      // Ownership is also checked before every source commit.
    }
  }, 20_000);
  try {
    let credential = token;
    for (const [index, source] of sources.entries()) {
      const state = db.prepare("SELECT * FROM source_state WHERE source=?").get(source.key);
      const now = clock();
      const origin = new URL(source.url).origin;
      if (state?.next_attempt > now && (state.failures > 0 || (!manual && state.coverage_end >= start))) continue;
      if (state?.blocked && !manual) continue;
      if (db.prepare("SELECT 1 FROM origin_backoff WHERE origin=? AND retry_at>?").get(origin, now)) continue;
      if (source.repo && credential === undefined) credential = githubToken();
      const from = manual || !state?.checked
        ? start
        : Math.min(start, (state.coverage_end ?? state.checked) - 7 * 24 * hour);
      progress = `${index + 1}/${sources.length} · ${source.project}`;
      renew(progress);
      let collected;
      try {
        collected = await collectSource(db, source, from, upTo, credential, fetcher, clock);
      } catch (error) {
        const count = (state?.failures ?? 0) + 1;
        const base = Math.min(cadence, 15 * 60_000 * 2 ** Math.min(count - 1, 5));
        const retry = Math.max(clock() + Math.min(cadence, base * (1 + Math.random() * 0.08)), error.waitUntil ?? 0);
        const message = error instanceof FetchError ? error.message
          : error.name === "TimeoutError" ? "Request timed out" : error instanceof SyntaxError ? "Invalid upstream response" : "Network or source error";
        transaction(db, () => {
          renew(progress);
          db.prepare(`INSERT INTO source_state(source,next_attempt,failures,error,blocked) VALUES(?,?,?,?,?)
            ON CONFLICT(source) DO UPDATE SET next_attempt=excluded.next_attempt,
            failures=excluded.failures,error=excluded.error,blocked=excluded.blocked`)
            .run(source.key, error.blocked ? 0 : Math.ceil(retry), count, message, Number(Boolean(error.blocked)));
          if (message.includes("rate limited")) {
            db.prepare(`INSERT INTO origin_backoff VALUES(?,?) ON CONFLICT(origin) DO UPDATE
              SET retry_at=MAX(origin_backoff.retry_at, excluded.retry_at)`).run(origin, Math.ceil(retry));
          }
        });
        failed++;
        log(`${progress} · ${message}`);
        continue;
      }

      transaction(db, () => {
        renew(progress);
        for (const row of collected.rows) storeRelease(db, source, row, clock());
        const page = db.prepare(`INSERT INTO pages VALUES(?,?,?,?,?) ON CONFLICT(source,url) DO UPDATE SET
          etag=excluded.etag, modified=excluded.modified, payload=excluded.payload`);
        for (const item of collected.pages) page.run(source.key, item.url, item.etag, item.modified, item.payload);
        const checked = clock();
        const extendsCoverage = !collected.gap && !state?.gap &&
          state?.coverage_start != null && from <= state.coverage_end && upTo >= state.coverage_start;
        const coverageStart = extendsCoverage ? Math.min(from, state.coverage_start) : from;
        const coverageEnd = extendsCoverage ? Math.max(upTo, state.coverage_end) : upTo;
        db.prepare(`INSERT INTO source_state(source,checked,next_attempt,failures,error,gap,blocked,coverage_start,coverage_end)
          VALUES(?,?,?,0,NULL,?,0,?,?) ON CONFLICT(source) DO UPDATE SET
          checked=excluded.checked,next_attempt=excluded.next_attempt,failures=0,error=NULL,
          gap=excluded.gap,blocked=0,coverage_start=excluded.coverage_start,coverage_end=excluded.coverage_end`)
          .run(source.key, checked, checked + cadence, collected.gap, coverageStart, coverageEnd);
      });
      ok++;
      log(`${progress} · ${collected.rows.length} releases checked`);
    }
    return { busy: false, ok, failed };
  } finally {
    clearInterval(heartbeat);
    db.prepare("DELETE FROM sync_lock WHERE owner=?").run(owner);
    db.close();
  }
}
