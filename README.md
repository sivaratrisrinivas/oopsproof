# OopsProof

## What

OopsProof is a local web app for inspecting Buffer scheduled posts before they publish. It starts directly on the Queue Table, reads live Buffer data from the server, shows the selected Buffer Organization, and lists normalized Scheduled Posts due in the next 30 days.

## Why

Buffer automation makes it easy to leave risky scheduled posts in a live queue. OopsProof is designed as a safety layer that uses live Buffer data only, keeps the Buffer API key on the server, and avoids fake posts or demo fallback data so the user can trust what the queue shows.

## Buffer Loading

OopsProof uses the first Buffer Organization returned for the local API key, scans every channel in that organization, and fetches Scheduled Posts in the next 30 days. Buffer responses are normalized into Queue Posts with `id`, `text`, `channelId`, `channelName`, `service`, `status`, `dueAt`, and `createdAt` when available.

Scheduled Post loading follows Buffer cursor pagination using `pageInfo.hasNextPage` and `pageInfo.endCursor`. Buffer API calls are made only from the local Node server with `Authorization: Bearer <BUFFER_API_KEY>`.

## Queue Table

The first usable screen is the Queue Table. It shows every Scheduled Post in the scan window, ordered by due time, with post text, Buffer channel, service, status, due time, created time when available, Risk Level, and Findings.

OopsProof runs deterministic diagnosis with the v1 Risk Rules: Embargo Term Rule, Stale Relative Date Rule, and Duplicate Opening Rule. Each row shows the post's highest Risk Level. Risky Scheduled Posts can be opened to inspect every Finding. Clear Posts stay visible for context and have no Quarantine or other action control.

## Refresh

OopsProof refreshes the Queue Table only when the user presses Refresh. Refresh fetches live Buffer data again from the server, re-runs deterministic diagnosis against the newly loaded Scheduled Posts, and renders the current success, empty queue, or Buffer error state.

OopsProof v1 does not auto-refresh, poll Buffer, or store Quarantine History. The current Buffer queue remains the source of truth after each refresh.

## Quarantine

Risky Scheduled Posts offer Quarantine Confirmation before OopsProof touches Buffer. Confirmed Quarantine creates a same-channel Draft Post with `saveToDraft: true` and the Safe Draft Replacement text `Needs review before publishing: {original first 80 characters}`.

OopsProof does not delete or edit the original Scheduled Post. On success it shows the Draft Post ID and exactly: `Safe draft created. Remove the original scheduled post in Buffer.` Failed Quarantine shows the Buffer error without success copy.

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

Use a real Buffer account for live verification. OopsProof never uses fake posts, seeded posts, or demo fallback data, so the Queue Table only reflects live Buffer data visible to your API key.

1. In Buffer, create at least one Scheduled Post due in the next 30 days.
2. Start OopsProof with `npm run dev` and open `http://localhost:3000`.
3. Verify the Queue Table shows the selected Buffer Organization and your Scheduled Post.
4. Press Refresh. The page should stay on the Queue Table and reload live Buffer data.
5. To verify risk detection, create or edit a Scheduled Post before `2026-07-01` with text like `LaunchKit ships today for early partners`, then press Refresh.
6. Verify the risky row shows a High Risk Level and Findings for the embargo term and stale relative date phrase.
7. Check the Quarantine Confirmation checkbox and click Quarantine.
8. Verify OopsProof shows a Draft Post ID and exactly `Safe draft created. Remove the original scheduled post in Buffer.`
9. Open Buffer and verify a same-channel Draft Post was created with text starting `Needs review before publishing: `.
10. Verify the original Scheduled Post still exists in Buffer. Remove it manually if you do not want it to publish.

Full verification notes are documented in [docs/verification.md](docs/verification.md).
