# OopsProof

## What

OopsProof is a local web app for inspecting Buffer scheduled posts before they publish. It starts directly on the Queue Table, reads live Buffer data from the server, shows the selected Buffer Organization, and lists normalized Scheduled Posts due in the next 30 days.

## Why

Buffer automation makes it easy to leave risky scheduled posts in a live queue. OopsProof is designed as a safety layer that uses live Buffer data only, keeps the Buffer API key on the server, and avoids fake posts or demo fallback data so the user can trust what the queue shows.

## Buffer Loading

OopsProof uses the first Buffer Organization returned for the local API key, scans every channel in that organization, and fetches Scheduled Posts in the next 30 days. Buffer responses are normalized into Queue Posts with `id`, `text`, `channelId`, `channelName`, `service`, `status`, `dueAt`, and `createdAt` when available.

Scheduled Post loading follows Buffer cursor pagination using `pageInfo.hasNextPage` and `pageInfo.endCursor`. Buffer API calls are made only from the local Node server with `Authorization: Bearer <BUFFER_API_KEY>`.

## How

Create a local `.env` file with your Buffer API key:

```bash
BUFFER_API_KEY=your_buffer_api_key
```

Run the test suite:

```bash
npm test
```

Start the local app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

If `BUFFER_API_KEY` is missing or Buffer rejects it, OopsProof stops before loading Buffer data and shows a clear error. The `.env` file is ignored by git and must not be committed.
