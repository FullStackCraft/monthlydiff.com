# Deferred release sync

Build an editorial research tool when the publication needs it. Start with a manually maintained list of upstream projects and their official release feeds. Fetch GitHub Releases and other official feeds on demand, using conditional requests and respecting rate limits.

Normalize candidates to project, version, release date, source URL, and a short upstream excerpt. Store the sync cursor and candidate records locally in SQLite. Deduplicate by project and upstream release ID or version. Re-running a sync should safely update existing records and preserve editorial decisions.

Make upstream failures and partial runs visible. A failed source should keep its last good cursor and retry on the next run. Keep API tokens local and redact them from logs.

Show candidates to the editor for selection. Export source references for drafting in Git. Keep human review between collection and publication. A sync must never alter issue Markdown, publish a route, or send email.
