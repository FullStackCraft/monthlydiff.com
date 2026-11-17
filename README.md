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

In the existing signup provider, enable a hosted email form with double opt-in, bot protection, and an unsubscribe flow. A Mailchimp hosted form with double opt-in is one supported option. Set `SUBSCRIBE_URL` to the form's public HTTPS URL. End-to-end, check confirmation with an address you control and verify unsubscribe before opening signup. The homepage shows “Signups closed” while no valid URL is set.

Connect the Git repository using Netlify's standard Next.js integration. `netlify.toml` sets the build command and output directory. Set `SUBSCRIBE_URL` under the Netlify build environment and redeploy when it changes. When an issue is ready, commit `isDraft: false` and deploy from Git. The issue will appear on the homepage, calendar and archive. Publishing the website does not send email.

## Assets and deferred work

The web masthead uses [PrismCode Regular v0.1.2](https://github.com/princefishthrower/PrismCode/releases/tag/v0.1.2). The release font and its OFL notice are bundled in `public/fonts/prismcode/0.1.2/`. Its palette switches using the date in Europe/Vienna. December–February uses Ice, March–May uses Aurora, June–August uses Neon, and September–November uses Sunset.

Email uses the issue’s palette to pick a PNG from `public/branding/prismcode-0.1.2/` and includes live publication text as a fallback. Test sends embed the PNG as an inline attachment. The rendered HTML uses the public PNG URL by default.

The release index, collector, and production broadcasts are deferred. Before sending a broadcast, wire up confirmed subscriber consent and unsubscribe state in Resend and record the sent issue to prevent duplicates. The collector scope is in `backend/TODO.md`.
