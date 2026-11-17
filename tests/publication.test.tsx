import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { YearCalendar } from "../components/calendar/YearCalendar";
import { renderIssueEmail } from "../components/email/render-issue-email";
import { WebIssueRenderer } from "../components/issues/WebIssueRenderer";
import { formatDate, schedule } from "../lib/calendar";
import { chapters } from "../lib/chapters";
import { validateIssueMetadata } from "../lib/issue-schema";
import { listIssueMetadata, loadIssue } from "../lib/issues";
import { mastheadAssets } from "../lib/theme";

test("public readers respect publication status while local preview can read the issue", async () => {
  assert.equal(await loadIssue("../2027-01", { includeDraft: true }), null);
  const issue = await loadIssue("2027-01", { includeDraft: true });
  assert.ok(issue);
  assert.equal((await listIssueMetadata()).some(({ id }) => id === issue.id), !issue.isDraft);
  assert.deepEqual(await loadIssue(issue.id), issue.isDraft ? null : issue);
  assert.deepEqual(issue.chapters.map(({ label }) => label), chapters.map(({ label }) => label));
});

test("the schema rejects rollover dates and chapter paths outside the issue", () => {
  const metadata = {
    id: "2027-01",
    number: 1,
    publishDate: "2027-01-31",
    isDraft: true,
    mastheadPalette: "ice",
    headline: "<placeholder here>",
    subtitle: "<placeholder here>",
    chapters: Object.fromEntries(chapters.map(({ key }) => [key, `${key.toLowerCase()}.md`])),
  };
  assert.throws(
    () => validateIssueMetadata({ ...metadata, publishDate: "2027-02-29" }, metadata.id),
    /publishDate/,
  );
  assert.throws(
    () => validateIssueMetadata({
      ...metadata,
      chapters: { ...metadata.chapters, graveyard: "../graveyard.md" },
    }, metadata.id),
    /chapters\.graveyard/,
  );
});

test("the 2027 calendar marks only the twelve month ends in Vienna", () => {
  assert.deepEqual(schedule.map(({ lastDay }) => lastDay), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  assert.deepEqual(schedule.map(({ firstDay }) => firstDay), [4, 0, 0, 3, 5, 1, 3, 6, 2, 4, 0, 2]);
  assert.equal(formatDate("2027-03-28"), "28 March 2027");
  assert.equal(formatDate("2027-10-31"), "31 October 2027");

  const html = renderToStaticMarkup(<YearCalendar />);
  assert.equal((html.match(/<table /g) ?? []).length, 12);
  assert.deepEqual(
    Array.from(html.matchAll(/<time class="publication-day" dateTime="([^"]+)"/g), ([, date]) => date),
    schedule.map(({ publishDate }) => publishDate),
  );
});

test("one Markdown edit reaches web, HTML email and plain text in chapter order", async () => {
  const issue = await loadIssue("2027-01", { includeDraft: true });
  assert.ok(issue);
  const changed = {
    ...issue,
    headline: "Fixture headline",
    subtitle: "Fixture subtitle",
    chapters: issue.chapters.map((chapter, index) => index === 0
      ? {
          ...chapter,
          markdown: [
            "# Fixture heading",
            "Shared revision with *emphasis*, **bold**, `code`, and [calendar](/calendar).",
            "- One\n- Two",
            "3. Three\n4. Four",
            "<placeholder here>",
            "[Unsafe link](javascript:alert%281%29) and <iframe src=\"https://example.com\"></iframe>.",
          ].join("\n\n"),
        }
      : chapter),
  };

  const web = renderToStaticMarkup(<WebIssueRenderer issue={changed} />);
  const { html, text } = await renderIssueEmail(changed);

  for (const output of [web, html, text]) {
    for (const value of [changed.headline, changed.subtitle, "Shared revision", "Fixture heading", "One", "Two", "Three", "Four"]) {
      assert.ok(output.includes(value), value);
    }
    let previous = -1;
    for (const { label } of chapters) {
      const index = output.indexOf(label);
      assert.ok(index > previous, label);
      previous = index;
    }
  }

  for (const output of [web, html]) {
    for (const element of ["em", "strong", "code", "ul", "ol", "li", "h3"]) assert.match(output, new RegExp(`<${element}[ >]`));
    assert.match(output, /&lt;placeholder here&gt;/);
    assert.doesNotMatch(output, /href="javascript:|<iframe/i);
  }
  assert.match(web, /href="\/calendar"/);
  assert.match(html, /href="https:\/\/monthlydiff\.com\/calendar"/);
  assert.match(text, /https:\/\/monthlydiff\.com\/calendar/);
  assert.match(text, /<placeholder here>/);
  assert.match(html, /The Monthly Diff/);
  assert.match(text, /The Monthly Diff/);
});

test("a supplied email masthead keeps alt text and live publication text", async () => {
  const issue = await loadIssue("2027-01", { includeDraft: true });
  assert.ok(issue);
  const original = mastheadAssets.ice.emailImage;
  mastheadAssets.ice.emailImage = { url: "https://example.com/masthead.png", width: 240, height: 42 };
  try {
    const { html, text } = await renderIssueEmail({ ...issue, mastheadPalette: "ice" });
    assert.match(html, /<img[^>]*alt="The Monthly Diff"/);
    assert.match(html, />The Monthly Diff<\/p>/);
    assert.match(text, /The Monthly Diff/);
    assert.doesNotMatch(text, /masthead\.png/);
  } finally {
    mastheadAssets.ice.emailImage = original;
  }
});
