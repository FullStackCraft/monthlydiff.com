import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { renderIssueEmail } from "../components/email/render-issue-email";
import { issueIdPattern } from "../lib/issue-schema";
import { loadIssue } from "../lib/issues";
import { emailMastheadPath } from "../lib/theme";

const { values } = parseArgs({
  options: { issue: { type: "string", default: "2027-01" } },
});

const id = values.issue;
if (!issueIdPattern.test(id)) throw new Error("Use --issue YYYY-MM.");

const host = "127.0.0.1";
const port = 3001;

createServer(async (request, response) => {
  const path = request.url?.split("?", 1)[0];
  const plain = path === "/text";
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (request.method !== "GET" || (path !== "/" && !plain)) {
    response.writeHead(404).end("Page not found");
    return;
  }

  try {
    const issue = await loadIssue(id, { includeDraft: true });
    if (!issue) {
      response.writeHead(404).end("Issue not found");
      return;
    }
    const png = await readFile(join("public", emailMastheadPath(issue.mastheadPalette)));
    const { html, text } = await renderIssueEmail(issue, `data:image/png;base64,${png.toString("base64")}`);
    response.writeHead(200, { "Content-Type": plain ? "text/plain; charset=utf-8" : "text/html; charset=utf-8" });
    response.end(plain ? text : html);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end("Preview failed. See the terminal.");
  }
}).listen(port, host, () => {
  console.log(`Issue ${id} HTML at http://${host}:${port}/`);
  console.log(`Plain text at http://${host}:${port}/text`);
});
