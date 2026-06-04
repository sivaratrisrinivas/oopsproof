# OopsProof

## What

OopsProof is a local web app for inspecting Buffer scheduled posts before they publish. The current foundation starts directly on the Queue Table shell and includes loading, error, empty, and table regions ready for live Buffer data.

## Why

Buffer automation makes it easy to leave risky scheduled posts in a live queue. OopsProof is designed as a safety layer that uses live Buffer data only, keeps the Buffer API key on the server, and avoids fake posts or demo fallback data so the user can trust what the queue shows.

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

If `BUFFER_API_KEY` is missing, OopsProof stops before loading Buffer data and shows a clear missing-key error. The `.env` file is ignored by git and must not be committed.
