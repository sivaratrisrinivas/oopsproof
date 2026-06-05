# OopsProof

## What

OopsProof is a local web app for inspecting Buffer scheduled posts before they publish. It features a streamlined, high-polish 3-screen experience (Queue → Inspect → Quarantine) designed so the core objective — finding and safely quarantining a risky scheduled post — can be completed in no more than 3 clicks, with only one primary action per screen. It reads live Buffer data from the server, shows the selected Buffer Organization, and lists normalized Scheduled Posts due in the next 30 days.

The interface uses a Buffer.com-inspired color palette (warm off-white backgrounds, soft green primary actions with dark text, and warm neutral tones) and is structured as a proper desktop web application — full-width sticky top navigation bar, 1080px content container, and a 2-column layout on the Inspect screen (post on the left, sticky risk summary + action panel on the right) — instead of a narrow mobile-style view. Risky posts are visually prioritized on the Queue with color-coded left borders. Clear posts remain visible for context but offer no actions. Every interaction has been crafted with meticulous attention to detail for a premium, trustworthy feel.

## Design

The UI was fully redesigned to match Buffer.com's visual language (warm `#fefefb` backgrounds, `#213130` text, signature soft green `#b0ec9c` primary CTAs with dark text, and warm neutral borders) while shifting from a narrow mobile-app feel to a proper desktop web/SaaS experience:

- Full-width sticky top navigation bar with organization name and Refresh
- 1080px content container with generous spacing
- Wider Queue cards with improved meta layout
- 2-column Inspect view (post + sticky risk + action side panel)
- Updated risk color system that remains clearly distinguishable while fitting the warmer Buffer palette

The experience retains its Emil Kowalski-level attention to detail, one primary action per screen, and progressive enhancements (copy buttons, checkbox gating, keyboard support).

## Why

Buffer automation makes it easy to leave risky scheduled posts in a live queue. OopsProof is designed as a safety layer that uses live Buffer data only, keeps the Buffer API key on the server, and avoids fake posts or demo fallback data so the user can trust what the queue shows.

## Buffer Loading

OopsProof uses the first Buffer Organization returned for the local API key, scans every channel in that organization, and fetches Scheduled Posts in the next 30 days. Buffer responses are normalized into Queue Posts with `id`, `text`, `channelId`, `channelName`, `service`, `status`, `dueAt`, and `createdAt` when available.

Scheduled Post loading follows Buffer cursor pagination using `pageInfo.hasNextPage` and `pageInfo.endCursor`. Buffer API calls are made only from the local Node server with `Authorization: Bearer <BUFFER_API_KEY>`.

## The Queue (Screen 1)

The main screen is the Queue. Risky Scheduled Posts (those with High or Medium findings) are shown first with prominent color-coded left borders (updated high/medium tones in the Buffer palette), an excerpt of the post text, channel/service, nicely formatted due time, risk level badge, and a primary "Review →" action. 

Clear posts (no findings) appear below in a subdued section for full context but carry no quarantine controls. The UI uses a wider desktop layout with comfortable spacing and a persistent top navigation bar.

OopsProof runs deterministic diagnosis with the v1 Risk Rules: Embargo Term Rule, Stale Relative Date Rule, and Duplicate Opening Rule. Risk level is the highest across all findings for a post. Clicking Review on a risky post takes you to the dedicated Inspect screen for the complete text and every Finding.

## Refresh

A Refresh button is always available in the sticky top navigation bar. It fetches live Buffer data again from the server, re-runs deterministic diagnosis against the newly loaded Scheduled Posts, and renders the current Queue (or error/empty state).

OopsProof v1 does not auto-refresh, poll Buffer, or store Quarantine History. The current Buffer queue remains the source of truth after each refresh. The entire experience is server-rendered with progressive enhancements for delightful interactions (e.g. copy-to-clipboard on success, checkbox-gated action).

## Quarantine (Screens 2 & 3)

From the Queue, "Review" takes you to the Inspect screen (Screen 2) showing the full post text, metadata, and all Findings in a desktop-friendly 2-column layout (main post content on the left, sticky "Risk summary" panel with findings and the primary action on the right; collapses to single column on smaller screens). The single action here is "Quarantine this post", which leads to the dedicated Quarantine screen (Screen 3).

The Quarantine screen presents the exact Safe Draft Replacement text that will be created (`Needs review before publishing: {original first 80 characters}`), a clear explanation that the original Scheduled Post will remain in Buffer (and must be removed manually), and a required confirmation checkbox before the primary "Create Safe Draft" action.

Confirmed Quarantine creates a same-channel Draft Post with `saveToDraft: true`. On success the Quarantine screen shows the Draft Post ID (with one-click copy) and exactly: `Safe draft created. Remove the original scheduled post in Buffer.` Failed Quarantine shows the Buffer error without any success copy. The original post is never touched.

## First-Time Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file with your Buffer API key:

```bash
BUFFER_API_KEY=your_buffer_api_key
```

Run the automated test suite:

```bash
npm test
```

Automated tests do not require Buffer credentials or live Buffer calls.

Start the local app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

If `BUFFER_API_KEY` is missing or Buffer rejects it, OopsProof stops before loading Buffer data and shows a clear error. The `.env` file is ignored by git and must not be committed.

## End-to-End Verification

Use a real Buffer account for live verification. OopsProof never uses fake posts, seeded posts, or demo fallback data, so the Queue only reflects live Buffer data visible to your API key.

1. In Buffer, create at least one Scheduled Post due in the next 30 days.
2. Start OopsProof with `npm run dev` and open `http://localhost:3000`.
3. Verify the Queue shows the selected Buffer Organization and your Scheduled Post (risky items appear first with visual emphasis).
4. Press Refresh (header button). The page reloads live Buffer data on the Queue.
5. To verify risk detection, create or edit a Scheduled Post before `2026-07-01` with text like `LaunchKit ships today for early partners`, then press Refresh.
6. Verify the risky card shows a High Risk Level (and a finding summary on the card itself).
7. Click "Review →" on the risky card to reach the Inspect screen. Click the "Quarantine this post" action to reach the dedicated Quarantine confirmation screen.
8. Check the confirmation checkbox and click "Create Safe Draft".
9. Verify OopsProof (on the Quarantine screen) shows a Draft Post ID (with copy button) and exactly `Safe draft created. Remove the original scheduled post in Buffer.`
10. Open Buffer and verify a same-channel Draft Post was created with text starting `Needs review before publishing: `.
11. Verify the original Scheduled Post still exists in Buffer. Remove it manually if you do not want it to publish.

Full verification notes are documented in [docs/verification.md](docs/verification.md).

## Deploying To Vercel

OopsProof can run on Vercel through the serverless handler in `api/index.js`. The local `npm run dev` flow still uses `src/server.js`; production traffic on Vercel is routed to the serverless handler by `vercel.json`.

Before deploying, add `BUFFER_API_KEY` as a Vercel Project Environment Variable. Do not upload or commit a local `.env` file.

Deploy from the Vercel dashboard by importing this repository, or deploy with the Vercel CLI:

```bash
npx vercel
```

For production:

```bash
npx vercel --prod
```

After deployment, open the Vercel URL and run the same End-to-End Verification flow above. Buffer API calls still happen server-side, and automated tests still avoid live Buffer calls.
