# OopsProof Verification

## Automated Tests

Automated tests must not require live Buffer calls or a real Local Buffer API Key. Run them from the repository root:

```bash
npm test
```

The test suite uses injected `fetch`, `loadBufferData`, and `createDraftPost` functions to verify Buffer Connector behavior, Queue Model normalization, Risk Rules, Queue Table states, and Quarantine behavior without reading `.env` secrets or calling `https://api.buffer.com`.

Coverage expectations:

- Buffer Connector tests cover request auth, missing and invalid Local Buffer API Key handling, GraphQL errors, Buffer mutation errors, scheduled-post pagination, scheduled-post retrieval, and Draft Post creation with `saveToDraft: true`.
- Queue Model tests cover normalization from Buffer-shaped post and channel data into Queue Posts, plus Scan Window filtering to the next 30 days.
- Risk Engine tests cover Embargo Term, Stale Relative Date, and Duplicate Opening Rules, multiple Findings, highest Risk Level selection, and Clear Posts.
- Quarantine Service tests cover same-channel Safe Draft Replacement text, success with Draft Post ID, and Failed Quarantine without false success copy.
- UI tests cover missing key, invalid key, loading, empty queue, Clear Post rows without actions, risky post details, Quarantine Confirmation, draft success, draft failure, and manual Refresh.

Do not add fake posts, seeded data, demo fallback data, AI behavior, Quarantine History, organization pickers, or channel pickers as testing shortcuts.

## Optional Live Buffer Verification

Live verification is manual and optional. Use it only when you have a real Buffer account and are comfortable creating a Draft Post during Quarantine verification.

1. Create a local `.env` file that is not committed:

   ```bash
   BUFFER_API_KEY=your_buffer_api_key
   ```

2. Start OopsProof:

   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000`.

4. Verify the Queue Table shows the selected first Buffer Organization, scans all channels, and lists only live Scheduled Posts due in the next 30 days.

5. Press Refresh and verify the page reloads from live Buffer data without auto-refresh, polling, or stored Quarantine History.

6. For a risky Scheduled Post, review Quarantine Confirmation. If you confirm it, verify Buffer receives a same-channel Draft Post whose text starts with `Needs review before publishing: `.

7. After successful Quarantine, verify OopsProof shows the Draft Post ID and exactly `Safe draft created. Remove the original scheduled post in Buffer.` The original Scheduled Post remains in Buffer and must be removed manually.

Never print, commit, or paste the Local Buffer API Key into issue comments, logs, screenshots, or browser-visible app code.
