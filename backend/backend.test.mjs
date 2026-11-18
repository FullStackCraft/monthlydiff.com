import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { changeAllDecisions, changeDecision, issueCards, openDb, setFreeze } from "./db.mjs";
import { monthBounds } from "./model.mjs";
import { cadence, pickHook, sync } from "./sync.mjs";

const month = "2026-11";
const nov18 = Date.parse("2026-11-18T10:00:00Z");
const github = {
  key: "example/tool", repo: "example/tool", project: "Example", ecosystem: "Tools",
  url: "https://api.github.com/repos/example/tool/releases?per_page=100",
};
const feed = {
  key: "https://example.org/releases.xml", url: "https://example.org/releases.xml",
  project: "Example", ecosystem: "Tools",
};
const release = (id, tag, day = "10", body = "Fix a parser crash while loading configuration files.") => ({
  id, tag_name: tag, name: tag, body, published_at: `2026-11-${day}T12:00:00Z`,
  html_url: `https://github.com/example/tool/releases/tag/${tag}`,
});

function setup(t) {
  const folder = mkdtempSync(join(tmpdir(), "monthlydiff-test-"));
  const dbPath = join(folder, "test.sqlite");
  const db = openDb(dbPath);
  t.after(() => {
    db.close();
    rmSync(folder, { recursive: true });
  });
  let now = nov18;
  return { db, advance: (ms) => { now += ms; }, run: (fetcher, options) => sync({
    month, token: "", dbPath, sources: [github], clock: () => now, fetcher, ...options,
  }) };
}

test("Vienna month boundaries account for daylight saving and release hooks fall back visibly", () => {
  assert.equal(new Date(monthBounds("2026-11").start).toISOString(), "2026-10-31T23:00:00.000Z");
  assert.equal(new Date(monthBounds("2027-06").start).toISOString(), "2027-05-31T22:00:00.000Z");
  assert.equal(pickHook("v1.2.0", "https://example.org/official-notes").needsReview, true);
  assert.equal(pickHook("v1.2.0", "## What's Changed\n- Fix a crash on invalid package manifests.").hook,
    "Fix a crash on invalid package manifests.");
});

test("backfill deduplicates feed mirrors and conditional refresh preserves editorial decisions", async (t) => {
  const { db, run } = setup(t);
  const backfill = await run(async (url) => {
    if (url === feed.url) return new Response(`<rss><channel><item><title>Version 1.2.0</title>
      <link>https://example.org/1.2.0</link><pubDate>Tue, 10 Nov 2026 12:00:00 GMT</pubDate>
      <description>Mirrored release notes for the November version.</description></item></channel></rss>`);
    return Response.json([release(1, "v1.2.0"), release(2, "v1.2.1", "20")], { headers: { etag: '"a"' } });
  }, { manual: true, sources: [feed, github] });

  assert.equal(backfill.ok, 2);
  const [card, extra] = issueCards(db, month);
  assert.equal(extra, undefined);
  assert.equal(card.status, "untriaged");
  assert.match(card.url, /github.com/);
  changeDecision(db, month, { id: card.id, status: "shortlist", note: "Worth covering." });
  await run(async (_url, { headers }) => {
    assert.equal(headers["If-None-Match"], '"a"');
    return new Response(null, { status: 304 });
  }, { manual: true });
  assert.deepEqual(issueCards(db, month).map(({ id, note, status }) => ({ id, note, status })),
    [{ id: card.id, note: "Worth covering.", status: "shortlist" }]);
});

test("a broken page preserves the last complete scan and retries after backoff", async (t) => {
  const { db, run, advance } = setup(t);
  await run(async () => Response.json([release(1, "v1.0.0")]), { manual: true });
  const syncBefore = db.prepare("SELECT checked FROM source_state").get().checked;
  const next = github.url + "&page=2";
  const broken = await run(async (url) => url === next
    ? new Response("", { status: 503 })
    : Response.json([release(2, "v1.1.0")], { headers: { link: `<${next}>; rel="next"` } }),
  { manual: true });
  assert.equal(broken.failed, 1);
  assert.equal(db.prepare("SELECT checked FROM source_state").get().checked, syncBefore);
  assert.deepEqual(issueCards(db, month).map(({ version }) => version), ["v1.0.0"]);
  assert.equal((await run(async () => assert.fail("retry was too early"), { manual: true })).ok, 0);
  advance(17 * 60_000);
  await run(async () => Response.json([release(2, "v1.1.0")]));
  assert.equal(issueCards(db, month).length, 2);
});

test("changelog pointers use the exact tagged section and preserve editor decisions on retry", async (t) => {
  const { db, run } = setup(t);
  const sources = [{ ...github, changelogPath: "packages/example/CHANGELOG.md" }];
  const tag = "v1.2.0";
  const raw = `https://raw.githubusercontent.com/example/tool/${tag}/packages/example/CHANGELOG.md`;
  const fetchRelease = () => Response.json([
    release(1, tag, "10", "Please refer to CHANGELOG.md for details."),
  ]);
  await run(async (url) => {
    if (url === github.url) return fetchRelease();
    assert.equal(url, raw);
    return new Response(`## <small>[1.3.0](https://example.org/newer) (2026-11-12)</small>
* A different version gets its own change.
## <small>[1.2.0](https://example.org/current) (2026-11-10)</small>
### Fixes
* **parser:** keep escaped spaces in file paths ([#12](https://example.org/12)) (abcdef0)
* Scan generated files with the correct decoder.
## 1.1.0
* A previous version gets another change.`);
  }, { manual: true, sources });
  const [card] = issueCards(db, month);
  assert.deepEqual(card.highlights, [
    "parser: keep escaped spaces in file paths",
    "Scan generated files with the correct decoder.",
  ]);
  assert.match(card.url, /blob\/v1\.2\.0\//);
  assert.doesNotMatch(card.excerpt, /different version|previous version/);
  changeDecision(db, month, { id: card.id, status: "shortlist", hook: "Editor hook", note: "Keep." });
  await run(async (url) => url === github.url ? fetchRelease() : new Response("", { status: 503 }),
    { manual: true, sources });
  const [updated] = issueCards(db, month);
  assert.equal(updated.id, card.id);
  assert.equal(updated.hook, "Editor hook");
  assert.equal(updated.status, "shortlist");
  assert.equal(updated.note, "Keep.");
  assert.deepEqual(updated.highlights, card.highlights);
});

test("card highlights prefer release changes over shared banners, dates, and contributor noise", async (t) => {
  const { db, run } = setup(t);
  const body = `> This tool includes an official skill for coding agents. See the development guide.

Released on 2026-11-10.

### Fixes
* Fix the generated schema for nested models. PR [#14490](https://example.org/14490) by @example.
### Security
* [Cross-tenant disclosure through the shared cache](https://example.org/advisory)
### New Contributors
* Add a first contribution to the docs.`;
  await run(async () => Response.json([release(1, "v1.2.0", "10", body)]));
  const [card] = issueCards(db, month);
  assert.deepEqual(card.highlights, [
    "Cross-tenant disclosure through the shared cache",
    "Fix the generated schema for nested models.",
  ]);
  assert.equal(card.hook, card.highlights[0]);
  assert.match(card.excerpt, /official skill/);
});

test("an empty tagged changelog uses the verified comparison without borrowing another version's notes", async (t) => {
  const { db, run } = setup(t);
  const sources = [{ ...github, changelogPath: "CHANGELOG.md" }];
  const result = await run(async (url) => {
    if (url === github.url) return Response.json([release(1, "v1.2.0", "10", "See CHANGELOG.md.")]);
    if (url.startsWith("https://raw.githubusercontent.com")) return new Response(
      "## [1.2.0](https://github.com/example/tool/compare/v1.1.0...v1.2.0)\n\n## 1.1.0\n* An unrelated change."
    );
    assert.equal(url, "https://api.github.com/repos/example/tool/compare/v1.1.0...v1.2.0");
    return Response.json({ total_commits: 1, commits: [{ commit: { message: "release: v1.2.0" } }] });
  }, { manual: true, sources });
  assert.equal(result.ok, 1);
  const [card] = issueCards(db, month);
  assert.match(card.hook, /release bookkeeping only/);
  assert.doesNotMatch(card.excerpt, /unrelated/);
  assert.match(card.url, /compare\/v1\.1\.0\.\.\.v1\.2\.0$/);
});

test("rate limits and a single-run lock survive overlapping invocations", async (t) => {
  const { run, advance } = setup(t);
  const other = { ...github, key: "example/other", url: github.url.replace("/tool/", "/other/") };
  const limited = await run(async () => new Response("", { status: 429, headers: { "retry-after": "3600" } }),
    { sources: [github] });
  assert.equal(limited.failed, 1);
  await run(async () => assert.fail("host limit was not shared"), { sources: [other], manual: true });

  advance(cadence);
  let resume;
  const block = new Promise((resolve) => { resume = resolve; });
  const first = run(async () => { await block; return Response.json([]); });
  try {
    assert.equal((await run(async () => assert.fail("two simultaneous collectors"))).busy, true);
  } finally {
    resume();
    await first;
  }
});

test("shortlist order survives freeze, editing resumes on unfreeze and holds carry into December", async (t) => {
  const { db, run } = setup(t);
  await run(async () => Response.json([release(1, "v1.0.0"), release(2, "v1.1.0"), release(3, "v1.2.0")]));
  const [first, second, held] = issueCards(db, month);
  changeDecision(db, month, { id: first.id, status: "shortlist" });
  changeDecision(db, month, { id: second.id, status: "shortlist", beforeId: first.id });
  changeDecision(db, month, { id: held.id, status: "hold", note: "Look again next month." });
  setFreeze(db, month, true);
  const firstSnapshot = JSON.parse(db.prepare("SELECT snapshot FROM freezes").get().snapshot);
  assert.deepEqual(firstSnapshot.map(({ id }) => id), [second.id, first.id]);
  assert.throws(() => changeDecision(db, month, { id: first.id, status: "skip" }), /Unfreeze/);
  assert.match(issueCards(db, "2026-12")[0].note, /next month/);
  assert.equal(issueCards(db, "2026-12")[0].status, "untriaged");
  setFreeze(db, month, false);
  changeDecision(db, month, { id: first.id, status: "used" });
  setFreeze(db, month, true);
  assert.equal(JSON.parse(db.prepare("SELECT snapshot FROM freezes").get().snapshot).length, 1);
});

test("a sync after freeze leaves the snapshot intact and carries the new release forward", async (t) => {
  const { db, run, advance } = setup(t);
  await run(async () => Response.json([release(1, "v1.0.0")]));
  changeDecision(db, month, { id: issueCards(db, month)[0].id, status: "shortlist" });
  setFreeze(db, month, true);
  db.prepare("UPDATE freezes SET frozen_at = ?").run(nov18);
  const snapshot = db.prepare("SELECT snapshot FROM freezes").get().snapshot;

  advance(cadence);
  await run(async () => Response.json([release(1, "v1.0.0"), release(2, "v1.1.0", "17")]));
  assert.equal(db.prepare("SELECT snapshot FROM freezes").get().snapshot, snapshot);
  assert.deepEqual(issueCards(db, month).map(({ version, status }) => [version, status]),
    [["v1.1.0", "untriaged"], ["v1.0.0", "shortlist"]]);
  assert.deepEqual(issueCards(db, "2026-12").map(({ version }) => version), ["v1.1.0"]);
});

test("bulk triage preserves card details, respects freezes and affects only the selected edition", async (t) => {
  const { db, run } = setup(t);
  await run(async () => Response.json([release(1, "v1.0.0"), release(2, "v1.1.0"), release(3, "v1.2.0")]));
  const [kept, held, fresh] = issueCards(db, month);
  changeDecision(db, month, { id: kept.id, status: "shortlist" });
  changeDecision(db, month, { id: held.id, status: "hold" });
  changeDecision(db, "2026-12", { id: held.id, status: "used" });
  changeDecision(db, month, { id: fresh.id, note: "Keep this detail.", chapter: "Noteworthy Updates", hook: "Editor hook" });

  changeAllDecisions(db, month, "skip-untriaged");
  assert.deepEqual(issueCards(db, month).map(({ status }) => status), ["shortlist", "hold", "skip"]);
  setFreeze(db, month, true);
  for (const action of ["reset", "skip-untriaged"]) {
    assert.throws(() => changeAllDecisions(db, month, action), /Unfreeze/);
  }
  setFreeze(db, month, false);
  changeAllDecisions(db, month, "reset");
  const cards = issueCards(db, month);
  assert.ok(cards.every(({ status, position }) => status === "untriaged" && position === 0));
  const restored = cards.find(({ id }) => id === fresh.id);
  assert.equal(restored.note, "Keep this detail.");
  assert.equal(restored.chapter, "Noteworthy Updates");
  assert.equal(restored.hook, "Editor hook");
  assert.equal(issueCards(db, "2026-12")[0].status, "used");
});
