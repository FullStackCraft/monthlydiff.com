# The Monthly Diff

## Run locally

Use Node 22 and npm.

```sh
npm install
npm run dev
```

Open [the site](http://127.0.0.1:3000) or the [January draft](http://127.0.0.1:3000/issues/2027-01). Edit the issue YAML and chapter Markdown in `content/issues/2027-01/`. Web and email use the same files. The five chapter labels and order live in `lib/chapters.ts`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Run the production server after stopping the dev server, or pass `-- --port 3002` to `npm start`. In production, `/issues/2027-01` returns 404 until the issue is published. The calendar lists the public month-end schedule independently of draft content.

## Email

```sh
npm run email:preview
npm run email:test -- --issue 2027-01
```

Preview [HTML](http://127.0.0.1:3001/) and [plain text](http://127.0.0.1:3001/text) on loopback. Refresh after editing Markdown. Add `-- --issue YYYY-MM` to preview a different issue.

For a live inbox test, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `.env.local` or in your shell. Use a Resend sending key and a single address on a verified sending domain. The command sends a `[TEST]` message to the three hardcoded Gmail, Outlook and Hotmail addresses. Add `--to` followed by one of those addresses to test a single inbox. Check mobile layout, links, the fallback with remote images disabled, and the plain-text part. Keep these settings local.

## Signup and deployment

Create a dedicated segment in Resend for The Monthly Diff. Copy its ID into `RESEND_SEGMENT_ID`. The app uses `RESEND_CONTACTS_API_KEY` (Full Access) to update contacts and segment membership. For the welcome email, use `RESEND_FROM` on a verified sending domain, optionally set `RESEND_REPLY_TO`, and optionally provide a narrower `RESEND_API_KEY` for sending. Generate a long random value for `NEWSLETTER_LINK_SECRET` with `openssl rand -hex 32`. Keep the secret stable across deploys so existing links work.

To try the complete flow, set these values in `.env.local`, set `NEWSLETTER_SIGNUP_ENABLED=true`, then run:

```sh
netlify dev --offline --no-open --port 8888
```

Open [the local site](http://127.0.0.1:8888/). Netlify Dev serves the function and uses its local Blobs sandbox. No push or prior deploy is required. The Resend credentials and segment still determine where the messages and contact updates go. Use an address you control. Submit the form, open the welcome email on the same Mac, click **Confirm subscription**, then click **Cancel signup or unsubscribe** in its footer. In Resend, check that the contact is subscribed in the segment after confirmation and marked unsubscribed after opting out. Submitting the form alone does not add a subscriber. Resend’s contact-level unsubscribe applies across Broadcasts in the same Resend workspace.

For production, connect the Git repository to Netlify. Set the newsletter variables for the Functions scope, include the signup flag in Builds as well, and deploy. Production email links use `https://monthlydiff.com`. Set `NEWSLETTER_SIGNUP_ENABLED=false` to close signup while leaving existing email links usable.

Publishing an issue on the website does not send email. Once an issue is public, run `npm run email:broadcast -- --issue YYYY-MM` to create an unsent Resend Broadcast draft for the configured segment. Review the draft and send from Resend when ready. Its footer uses Resend’s subscriber-specific unsubscribe link. Check for an existing draft or send before creating another draft for that issue.

## Search and link previews

Page metadata and the shared social image are configured in `lib/seo.ts`. The site serves `/robots.txt`, `/sitemap.xml`, `/rss.xml`, and `/llms.txt`. The discovery files pick up newly published issues from the same source as the archive.

To inspect a page’s Markdown representation locally, run `curl -H 'Accept: text/markdown' http://127.0.0.1:3000/issues`. The Markdown routes list only published issues, including during local development.

## Assets and deferred work

The web masthead uses [PrismCode Regular v0.1.2](https://github.com/princefishthrower/PrismCode/releases/tag/v0.1.2). The release font and its OFL notice are bundled in `public/fonts/prismcode/0.1.2/`. Its palette switches using the date in Europe/Vienna. December–February uses Ice, March–May uses Aurora, June–August uses Neon, and September–November uses Sunset.

Email uses the issue’s palette to pick a PNG from `public/branding/prismcode-0.1.2/` and includes live publication text as a fallback. Test sends embed the PNG as an inline attachment. The rendered HTML uses the public PNG URL by default.

The public release index is deferred. The collector workflow is in `backend/TODO.md`.

## Local editorial board

The private board runs at [127.0.0.1:3033](http://127.0.0.1:3033/). November and December 2026 are practice editions. The site and its SQLite data live under `backend/`; the public Next.js site does not serve them.

```sh
npm run triage:install                  # Start the board and install the macOS background sync
npm run triage:sync -- --month 2026-11  # Backfill November or refresh a selected month
npm run triage:stop                     # Remove the two LaunchAgents and keep editorial data
```

Use `npm run triage` for a foreground board without the scheduled collector. The collector uses the local GitHub CLI login when available and also accepts `MONTHLYDIFF_GITHUB_TOKEN` for a foreground run. Edit `backend/sources.json` to adjust the watchlist. Choose the edition in the board and check source coverage before freezing. Freeze snapshots can be exported as Markdown.
