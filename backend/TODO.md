# Local release sync and editorial board

The editorial collector uses a manually maintained list of upstream projects and their official release feeds. Fetch GitHub Releases and other official feeds in the background and on demand, using conditional requests and respecting rate limits.

## Background collection on macOS

Use a per-user `launchd` job at login and on 15-minute calendar ticks. Each invocation checks which sources are due and exits when there is nothing to do. The normal interval is six hours per healthy source, measured from its last successful check. After sleep or shutdown, check overdue sources at the next wake or login. Offer a manual Sync now before triage. Scheduled and manual runs share a single-run lock and honor upstream retry limits.

Persist each source's last successful check, cursor, retry count, and next eligible attempt in local SQLite. Use bounded network timeouts. Retry timeouts, connection errors, and temporary upstream failures after 15 minutes, then double the delay up to six hours with a small random spread. Honor any longer upstream wait. Reset the backoff on success, including a successful unchanged check. Surface configuration or authentication errors for the editor to fix. Keep API tokens local and redact them from logs.

Normalize candidates to project, version, release date, source URL, and a short upstream excerpt. Catch up from the last successful cursor with an overlapping fetch so missed runs and late feed entries can be picked up. Finish a source's required pages before committing its candidate upserts and advancing its cursor and conditional-request state together. A failed source keeps its last complete data while other sources finish. Match by stable upstream release ID and merge clear cross-source duplicates under the same project and canonical version. Preserve distinct release tracks and all editorial decisions on re-sync.

For a new source or a dry run, support an immediate backfill for the selected month. For the current month, start at midnight on the first in Europe/Vienna and collect through the time of the sync. Fetch available pages back to the start of the window and report per-source progress and any gap in available history. Show completed sources as they finish. Use the regular six-hour cadence to keep the results fresh after backfill.

## Monthly triage

Collect throughout the month. Around the 27th, the editor can do a quick source coverage check. Start formal triage two calendar days before publication in Europe/Vienna. Run a refresh first and show the last successful check, any failures, and pending retries. The cached scan stays readable offline. Mark it partial when a source is stale or its available history leaves a gap so the editor can decide whether to wait or freeze with the available coverage.

Make the same local scan available throughout the month. Open to This Month and show the cached hooks immediately, grouped by ecosystem. Show release and unreviewed counts, source freshness, and a Sync now action. Let the editor filter to unreviewed items or make early triage decisions. Opening the view should leave decisions and the shortlist freeze untouched.

Show every candidate for the selected month by default, with held items from earlier months marked as carryovers. Group projects by ecosystem, such as Python, Rust, or JavaScript → React. Give each project one primary group in the source list so a cross-ecosystem release appears once in the default scan. Use a Cross-ecosystem or Uncategorized group where needed. Keep ecosystem groups independent of the issue's chapters.

Make the one-line hook the most prominent part of each row. Show the project, version, release date, source link, and triage decision alongside it. Lead with a concrete change highlighted in the upstream notes. If the source gives only a version or a vague title, flag the row for a closer look and keep it visible. Let the editor refine the hook as a private note. Keep the source excerpt available on demand.

Within each group, keep a project's releases together so the editor can compare them and decide whether they tell one story. Show total and unreviewed counts per group and surface any failed sources next to the scan. Support Shortlist, Hold, Skip, and Used decisions. Keep skipped items visible in the full scan so the editor can reconsider them after seeing the rest of the month.

## Local editorial board

Run a small editorial website on localhost, separate from the public site. For the selected issue, show five Kanban columns, with **Untriaged** on the left for incoming releases. Use rich green for **Shortlist**, yellow for **Hold**, red for **Skip**, and lighter green for **Used**. Keep the text labels visible. Keep the ecosystem scan available alongside the board for comparing hooks across projects. Show the hook prominently on the card. Support drag-and-drop between columns and reordering the shortlist, with a keyboard-accessible move action. Save decisions and shortlist order to local SQLite so they survive a reload.

## Soft shortlist freeze

Offer **Freeze shortlist** after the Day 1 scan or whenever the editor is ready. Ask for confirmation, then capture the current shortlist and its order for that issue, show a visible Frozen status, and disable drag-and-drop and other board moves. Keep syncing and show new releases in the ecosystem scan without adding them to the frozen selection. **Unfreeze** restores editing immediately. Freezing again captures the revised selection. Carry late releases forward by default.

Give each selection a proposed chapter, its official source, and the editor's note on why it matters. Export the frozen selection in shortlist order for drafting in Git.

Keep human review between collection and publication. The hooks and notes are research material. A sync must never alter issue Markdown, publish a route, or send email.
