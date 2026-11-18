import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { chapterLabels, columns, monthBounds } from "./model.mjs";

export const backendDir = dirname(fileURLToPath(import.meta.url));
export const defaultDb = join(backendDir, ".data", "triage.sqlite");

export function openDb(path = process.env.MONTHLYDIFF_DB || defaultDb) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY, project TEXT NOT NULL, identity TEXT NOT NULL,
      version TEXT NOT NULL, ecosystem TEXT NOT NULL, published INTEGER NOT NULL,
      discovered INTEGER NOT NULL, url TEXT NOT NULL, hook TEXT NOT NULL,
      needs_review INTEGER NOT NULL, excerpt TEXT NOT NULL, priority INTEGER NOT NULL,
      UNIQUE(project, identity)
    );
    CREATE TABLE IF NOT EXISTS upstream_ids (
      source TEXT NOT NULL, upstream_id TEXT NOT NULL, release_id INTEGER NOT NULL REFERENCES releases(id),
      PRIMARY KEY(source, upstream_id)
    );
    CREATE TABLE IF NOT EXISTS release_notes (
      release_id INTEGER PRIMARY KEY REFERENCES releases(id),
      url TEXT NOT NULL, highlights TEXT NOT NULL, excerpt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_state (
      source TEXT PRIMARY KEY, checked INTEGER, next_attempt INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0, error TEXT, gap TEXT, blocked INTEGER NOT NULL DEFAULT 0,
      coverage_start INTEGER, coverage_end INTEGER
    );
    CREATE TABLE IF NOT EXISTS pages (
      source TEXT NOT NULL, url TEXT NOT NULL, etag TEXT, modified TEXT, payload TEXT NOT NULL,
      PRIMARY KEY(source, url)
    );
    CREATE TABLE IF NOT EXISTS origin_backoff (
      origin TEXT PRIMARY KEY, retry_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions (
      month TEXT NOT NULL, release_id INTEGER NOT NULL REFERENCES releases(id), status TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', chapter TEXT NOT NULL DEFAULT '',
      hook TEXT NOT NULL DEFAULT '', PRIMARY KEY(month, release_id)
    );
    CREATE TABLE IF NOT EXISTS freezes (
      month TEXT PRIMARY KEY, frozen_at INTEGER NOT NULL, snapshot TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_lock (
      id INTEGER PRIMARY KEY CHECK(id = 1), owner TEXT NOT NULL, expires INTEGER NOT NULL,
      month TEXT NOT NULL, progress TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}

export function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function issueCards(db, month) {
  const { start, end } = monthBounds(month);
  const previous = new Date(start - 86_400_000).toISOString().slice(0, 7);
  const previousStart = monthBounds(previous).start;
  return db.prepare(`
    WITH earlier AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY release_id ORDER BY month DESC) AS last
      FROM decisions WHERE month < ?
    )
    SELECT r.id, r.project, r.ecosystem, r.version, r.published, COALESCE(n.url, r.url) AS url,
           COALESCE(NULLIF(COALESCE(d.hook, h.hook), ''), json_extract(n.highlights, '$[0]'), r.hook) AS hook,
           COALESCE(d.hook, h.hook, '') AS hookOverride,
           (n.release_id IS NULL AND r.needs_review AND NULLIF(COALESCE(d.hook, h.hook), '') IS NULL) AS needsReview,
           COALESCE(n.excerpt, r.excerpt) AS excerpt, n.highlights, COALESCE(d.status, 'untriaged') AS status,
           COALESCE(d.position, 0) AS position, COALESCE(d.chapter, h.chapter, '') AS chapter,
           COALESCE(d.note, h.note, '') AS note, r.published < ? AS carryover
    FROM releases r
    LEFT JOIN release_notes n ON n.release_id = r.id
    LEFT JOIN decisions d ON d.release_id = r.id AND d.month = ?
    LEFT JOIN earlier h ON h.release_id = r.id AND h.last = 1
    WHERE (r.published >= ? AND r.published < ?)
       OR d.release_id IS NOT NULL OR h.status = 'hold'
       OR (r.published >= ? AND r.published < ?
           AND h.release_id IS NULL
           AND r.discovered > (SELECT frozen_at FROM freezes WHERE month = ?))
    ORDER BY r.ecosystem, r.project, r.published DESC, r.id DESC
  `).all(month, start, month, start, end, previousStart, start, previous)
    .map((card) => ({ ...card, highlights: card.highlights ? JSON.parse(card.highlights) : [] }));
}

export class BoardError extends Error {}

function assertEditable(db, month) {
  if (db.prepare("SELECT 1 FROM freezes WHERE month = ?").get(month)) {
    throw new BoardError("Unfreeze this shortlist before moving or editing cards.");
  }
}

export function changeDecision(db, month, change) {
  return transaction(db, () => {
    assertEditable(db, month);
    const cards = issueCards(db, month);
    const card = cards.find(({ id }) => id === change.id);
    if (!card) throw new BoardError("That card does not belong to this edition.");
    const status = change.status ?? card.status;
    const note = change.note ?? card.note;
    const chapter = change.chapter ?? card.chapter;
    const hook = change.hook ?? card.hookOverride;
    if (!columns.some(({ id }) => id === status) ||
        typeof note !== "string" || note.length > 4000 ||
        typeof hook !== "string" || hook.length > 300 ||
        (chapter !== "" && !chapterLabels.includes(chapter))) {
      throw new BoardError("Invalid card change.");
    }

    let position = card.position;
    if (status !== "untriaged" && (status !== card.status || change.beforeId !== undefined)) {
      const ordered = cards.filter((item) => item.status === status && item.id !== card.id)
        .sort((a, b) => a.position - b.position);
      const before = ordered.findIndex(({ id }) => id === change.beforeId);
      ordered.splice(before < 0 ? ordered.length : before, 0, card);
      const update = db.prepare("UPDATE decisions SET position = ? WHERE month = ? AND release_id = ?");
      ordered.forEach((item, index) => update.run(index, month, item.id));
      position = ordered.indexOf(card);
    }

    db.prepare(`INSERT INTO decisions(month, release_id, status, position, note, chapter, hook)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(month, release_id) DO UPDATE SET
      status=excluded.status, position=excluded.position, note=excluded.note,
      chapter=excluded.chapter, hook=excluded.hook`
    ).run(month, card.id, status, position, note, chapter, hook);
  });
}

export function setFreeze(db, month, frozen) {
  return transaction(db, () => {
    if (!frozen) {
      db.prepare("DELETE FROM freezes WHERE month = ?").run(month);
      return;
    }
    const shortlist = issueCards(db, month).filter(({ status }) => status === "shortlist")
      .sort((a, b) => a.position - b.position);
    db.prepare("INSERT OR IGNORE INTO freezes VALUES (?, ?, ?)")
      .run(month, Date.now(), JSON.stringify(shortlist));
  });
}

export function changeAllDecisions(db, month, action) {
  return transaction(db, () => {
    assertEditable(db, month);
    if (action === "reset") {
      db.prepare("UPDATE decisions SET status = 'untriaged', position = 0 WHERE month = ?").run(month);
      return;
    }
    if (action !== "skip-untriaged") throw new BoardError("Choose a bulk triage action.");

    const { next } = db.prepare(`SELECT COALESCE(MAX(position) + 1, 0) AS next
      FROM decisions WHERE month = ? AND status = 'skip'`).get(month);
    const insert = db.prepare(`INSERT INTO decisions(month, release_id, status, position, note, chapter, hook)
      VALUES (?, ?, 'skip', ?, ?, ?, ?) ON CONFLICT(month, release_id) DO UPDATE SET
      status = excluded.status, position = excluded.position`);
    issueCards(db, month).filter(({ status }) => status === "untriaged").forEach((card, index) => {
      insert.run(month, card.id, next + index, card.note, card.chapter, card.hookOverride);
    });
  });
}
