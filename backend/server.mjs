import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { BoardError, backendDir, changeAllDecisions, changeDecision, issueCards, openDb, setFreeze } from "./db.mjs";
import { currentMonth, monthBounds, monthPattern } from "./model.mjs";
import { cadence, readSources, sync } from "./sync.mjs";

const host = "127.0.0.1";
const port = Number(process.env.MONTHLYDIFF_PORT || 3033);
const allowedHosts = new Set([`localhost:${port}`, `${host}:${port}`]);
const root = join(backendDir, ".dist");
const db = openDb();
const mime = { js: "text/javascript", css: "text/css", html: "text/html", woff2: "font/woff2", woff: "font/woff" };
let manualError = null;

function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
}

async function requestBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new BoardError("Expected JSON.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_000) throw new BoardError("Request body is too large.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new BoardError("Invalid JSON.");
  }
}

function board(month) {
  const delta = monthBounds(month);
  const now = Date.now();
  const targetEnd = Math.min(now, delta.end);
  const historical = delta.end <= now;
  const canSync = now > delta.start;
  const states = new Map(db.prepare("SELECT * FROM source_state").all().map((item) => [item.source, item]));
  const rates = new Map(db.prepare("SELECT * FROM origin_backoff WHERE retry_at>?").all(now)
    .map(({ origin, retry_at }) => [origin, retry_at]));
  const sources = readSources().map(({ key, project, ecosystem, url }) => {
    const state = states.get(key);
    const retry = Math.max(state?.error && !state.blocked ? state.next_attempt : 0, rates.get(new URL(url).origin) ?? 0);
    const covered = canSync && state?.coverage_start != null && state.coverage_start <= delta.start &&
      state.coverage_end >= (historical ? targetEnd : Math.max(delta.start + 1, targetEnd - cadence));
    return {
      key, project, ecosystem,
      checked: state?.checked ?? null,
      retry: retry || null,
      error: state?.error ?? null, gap: state?.gap ?? null,
      fresh: Boolean(covered && !state.error && !state.gap),
    };
  });
  const running = db.prepare("SELECT month,progress FROM sync_lock WHERE expires>?").get(now) ?? null;
  const freeze = db.prepare("SELECT frozen_at FROM freezes WHERE month=?").get(month)?.frozen_at ?? null;
  return { month, sources, running, freeze, cards: issueCards(db, month), canSync, manualError };
}

function markdown(month, cards) {
  const clean = (value) => value.replace(/[\r\n]+/g, " ").replace(/[\\`*_\[\]<>]/g, "\\$&");
  const lines = [`# ${month} shortlist`, ""];
  for (const card of cards) {
    lines.push(`- **${clean(card.project)} ${clean(card.version)}**${card.chapter ? ` · ${card.chapter}` : ""}`,
      `  - ${clean(card.hook)}`, `  - Source: <${card.url}>`);
    if (card.note) lines.push(`  - Editorial note: ${clean(card.note)}`);
  }
  return lines.join("\n") + "\n";
}

createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    if (!allowedHosts.has(req.headers.host) || req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
      reply(res, 403, { error: "Open the editorial board directly on localhost." });
      return;
    }
    const url = new URL(req.url, `http://${host}:${port}`);
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const type = mime[file.split(".").at(-1)];
      if (!type || !/^[a-zA-Z0-9_.-]+$/.test(file)) return reply(res, 404, { error: "Not found." });
      const bytes = await readFile(join(root, file));
      res.writeHead(200, { "Content-Type": type }).end(bytes);
      return;
    }

    const month = url.searchParams.get("month") ?? currentMonth();
    if (!monthPattern.test(month)) throw new BoardError("Choose a month in YYYY-MM format.");

    if (req.method === "GET" && url.pathname === "/api/board") return reply(res, 200, board(month));
    if (req.method === "POST" && url.pathname === "/api/sync") {
      await requestBody(req);
      if (monthBounds(month).start >= Date.now()) throw new BoardError("There is no release history yet for this month.");
      manualError = null;
      void sync({ month, manual: true, log: console.log }).catch((error) => {
        manualError = error.message;
        console.error(error.message);
      });
      return reply(res, 202, board(month));
    }
    if (req.method === "PATCH" && url.pathname === "/api/card") {
      const change = await requestBody(req);
      if (!Number.isSafeInteger(change.id)) throw new BoardError("Choose a release to update.");
      changeDecision(db, month, change);
      return reply(res, 200, board(month));
    }
    if (req.method === "POST" && url.pathname === "/api/bulk-triage") {
      const { action } = await requestBody(req);
      changeAllDecisions(db, month, action);
      return reply(res, 200, board(month));
    }
    if (req.method === "POST" && url.pathname === "/api/freeze") {
      const { frozen } = await requestBody(req);
      if (typeof frozen !== "boolean") throw new BoardError("Choose freeze or unfreeze.");
      setFreeze(db, month, frozen);
      return reply(res, 200, board(month));
    }
    if (req.method === "GET" && url.pathname === "/api/export") {
      const frozen = db.prepare("SELECT snapshot FROM freezes WHERE month=?").get(month);
      if (!frozen) throw new BoardError("Freeze the shortlist before exporting.");
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${month}-shortlist.md"`,
      }).end(markdown(month, JSON.parse(frozen.snapshot)));
      return;
    }
    reply(res, 404, { error: "Not found." });
  } catch (error) {
    if (error instanceof BoardError) reply(res, 400, { error: error.message });
    else if (error.code === "ENOENT") reply(res, 404, { error: "Not found." });
    else {
      console.error(error.message);
      reply(res, 500, { error: "The board could not complete that request. Check its local log." });
    }
  }
}).listen(port, host, () => console.log(`Editorial board at http://${host}:${port}/`));
