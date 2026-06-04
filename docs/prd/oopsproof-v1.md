## Problem Statement

People using Buffer automation can schedule posts faster, but that also makes it easier to accidentally leave risky content in the live publishing queue. A launch phrase can go out before an embargo date, a post can say "today" when it publishes next week, or two channels can carry nearly identical openings.

OopsProof helps a creator, founder, or small team inspect live Buffer scheduled posts before they publish. It does not generate social content. It finds obvious risks and helps the user recover by creating a human-reviewable Buffer draft.

## Solution

Build OopsProof v1 as a local web app that reads a Buffer API key from the project's local `.env` file, talks to Buffer's GraphQL API, loads one Buffer organization, scans all channels for scheduled posts due in the next 30 days, and runs three deterministic Risk Rules.

The main screen is the Queue Table. It shows Scheduled Posts, Buffer channel, due time, Risk Level, and Findings. Clear Posts are shown for context but cannot be changed. Risky posts can be opened to see all Findings. The user can start Quarantine from a risky post, confirm the action, and create a Safe Draft Replacement on the same Buffer channel.

OopsProof v1 does not delete the original scheduled post. After a draft is created, it shows: "Safe draft created. Remove the original scheduled post in Buffer." If draft creation fails, it shows the error and does not claim anything was fixed.

## User Stories

1. As a local user, I want OopsProof to read my Buffer API key from `.env`, so that I do not paste secrets into the browser.
2. As a local user, I want OopsProof to fail clearly when the Buffer API key is missing, so that I know what to fix before using the app.
3. As a local user, I want OopsProof to fail clearly when the Buffer API key is invalid, so that I do not mistake an auth problem for an empty queue.
4. As a local user, I want OopsProof to avoid fake posts, so that every result reflects my real Buffer account.
5. As a local user, I want OopsProof to load my Buffer organization, so that it can find the channels and scheduled posts it needs.
6. As a local user, I want OopsProof to use the first Buffer organization when more than one exists, so that v1 stays simple.
7. As a local user, I want the selected Buffer organization name shown clearly, so that I know which organization is being scanned.
8. As a local user, I want OopsProof to scan every channel in the selected Buffer organization, so that risky posts are not hidden behind a channel picker.
9. As a local user, I want OopsProof to fetch Scheduled Posts due in the next 30 days, so that the scan focuses on the upcoming queue.
10. As a local user, I want OopsProof to sort upcoming Scheduled Posts by due time, so that the queue is easy to scan.
11. As a local user, I want OopsProof to show an empty state when there are no Scheduled Posts in the next 30 days, so that I know the live queue was checked.
12. As a local user, I want OopsProof to show a manual Refresh button, so that I control when live Buffer data is fetched again.
13. As a local user, I want OopsProof to avoid auto-refresh, so that the demo does not change while I am looking at a post.
14. As a local user, I want OopsProof to show each Scheduled Post's text, channel, service, status, due time, and created time when available, so that I can understand the queue.
15. As a local user, I want OopsProof to normalize Buffer post data into one simple Queue Post shape, so that the rest of the app can ignore Buffer's raw GraphQL response.
16. As a local user, I want OopsProof to run an Embargo Term Rule, so that launch-sensitive terms are caught before the embargo date.
17. As a local user, I want the Embargo Term Rule to use a fixed Embargo Policy, so that the demo is clear and repeatable.
18. As a local user, I want the demo Embargo Policy to include terms like `LaunchKit`, `Acme partnership`, and `Series A`, so that the risk checks feel concrete.
19. As a local user, I want the demo Embargo Policy to use an allowed date of 2026-07-01, so that embargo Findings are easy to understand.
20. As a local user, I want OopsProof to run a Stale Relative Date Rule, so that posts using words like `today` or `tomorrow` are flagged when timing may be wrong.
21. As a local user, I want the Relative Date Phrase List to be fixed in v1, so that the rule stays simple.
22. As a local user, I want OopsProof to run a Duplicate Opening Rule, so that near-duplicate scheduled posts are easy to notice.
23. As a local user, I want the Duplicate Opening Rule to compare the first eight normalized words, so that duplicate openings are caught predictably.
24. As a local user, I want OopsProof to use only deterministic diagnosis, so that every Finding can be explained without AI guesswork.
25. As a local user, I want OopsProof to avoid AI rewriting, so that it does not create new risky content.
26. As a local user, I want OopsProof to mark embargo Findings as High, so that the most urgent risks stand out.
27. As a local user, I want OopsProof to mark stale relative date and duplicate opening Findings as Medium, so that lighter risks are visible without being overstated.
28. As a local user, I want a post with multiple Findings to show its highest Risk Level in the row, so that the table stays simple.
29. As a local user, I want a post detail view to show every Finding for that post, so that I can see all reasons it was flagged.
30. As a local user, I want Clear Posts to remain visible, so that I can see the full upcoming queue.
31. As a local user, I want Clear Posts to have no action button, so that OopsProof stays focused on risky posts.
32. As a local user, I want a risky post to offer Quarantine, so that I can create a safer review path.
33. As a local user, I want Quarantine to ask for confirmation, so that I understand it will touch live Buffer data.
34. As a local user, I want the Quarantine Confirmation to say the original Scheduled Post will remain in Buffer, so that I know I must remove it manually.
35. As a local user, I want Quarantine to create a Safe Draft Replacement on the same Buffer channel, so that the review draft appears in the right place.
36. As a local user, I want the Safe Draft Replacement text to be `Needs review before publishing: {original first 80 characters}`, so that the draft is conservative and traceable.
37. As a local user, I want OopsProof to show the new Draft Post ID after Quarantine succeeds, so that I can verify it in Buffer.
38. As a local user, I want OopsProof to show "Safe draft created. Remove the original scheduled post in Buffer.", so that the result is honest.
39. As a local user, I want OopsProof to avoid saying "Risk removed from queue" in v1, so that it does not claim deletion happened.
40. As a local user, I want Failed Quarantine to show the Buffer error, so that I know why the draft was not created.
41. As a local user, I want Failed Quarantine to leave the original Scheduled Post untouched, so that a failed recovery does not make things worse.
42. As a local user, I want OopsProof to avoid storing Quarantine History, so that v1 does not need a database.
43. As a local user, I want OopsProof to fetch live Buffer data again after refresh, so that the current Buffer queue remains the source of truth.
44. As a demo viewer, I want the first screen to be the Queue Table, so that the demo gets to the useful part immediately.
45. As a demo viewer, I want the product name to be OopsProof, so that the app feels focused and memorable.
46. As a developer, I want the package and app names to use `oopsproof`, so that code naming matches the product.
47. As a developer, I want Buffer API calls to happen from the server, so that the API key is not exposed in browser code.
48. As a developer, I want Buffer GraphQL errors to be normalized, so that the UI can show clear failure states.
49. As a developer, I want pagination support for scheduled post retrieval, so that the scan can handle more than the first page.
50. As a developer, I want risk detection to be tested without Buffer, so that the core safety logic is fast and reliable.
51. As a developer, I want Buffer integration code separated behind a small interface, so that UI and Risk Rule tests do not need live network calls.
52. As a developer, I want Quarantine action code separated from display code, so that success and failure behavior can be tested clearly.

## Implementation Decisions

- Product name: use **OopsProof** in user-facing text and `oopsproof` for code/package names.
- OopsProof v1 is a local web app. It reads the Buffer API key from a local `.env` file when the app starts.
- Do not put the Buffer API key in client-side browser code. Buffer API calls must run on the server side.
- If the Buffer API key is missing or invalid, show a clear missing/invalid key error and stop loading Buffer data.
- Use Buffer's GraphQL API at `https://api.buffer.com`.
- Authenticate Buffer requests with `Authorization: Bearer <BUFFER_API_KEY>`.
- Use the first Buffer organization returned by the API. Show its name clearly. Do not build organization selection in v1.
- Scan every channel in the selected Buffer organization. Do not build channel selection in v1.
- Fetch Scheduled Posts due in the next 30 days. Use live Buffer data only. Do not add fake posts or seeded fallback data.
- Support Buffer pagination when fetching posts. The API uses `pageInfo.hasNextPage` and `pageInfo.endCursor`; cursors must be treated as opaque.
- Normalize Buffer responses into a Queue Post shape with id, text, channelId, channelName, service, status, dueAt, and createdAt when available.
- Build a Buffer connector module with a small interface for loading organizations, loading channels, loading scheduled posts, and creating Draft Posts.
- Build a queue model module that turns Buffer data into Queue Posts and applies scan-window filtering.
- Build a risk engine module that accepts Queue Posts and fixed risk configuration, then returns Findings.
- Build three Risk Rules only: Embargo Term Rule, Stale Relative Date Rule, and Duplicate Opening Rule.
- Use a fixed v1 Embargo Policy: terms `LaunchKit`, `Acme partnership`, and `Series A`; allowed date `2026-07-01`.
- Use a fixed Relative Date Phrase List: `today`, `tomorrow`, `yesterday`, `this Friday`, and `next week`.
- Use a fixed Duplicate Opening Window of eight normalized words.
- Use Risk Levels only as High and Medium. Embargo Term Findings are High. Stale Relative Date and Duplicate Opening Findings are Medium.
- When a Scheduled Post has multiple Findings, summarize it by the highest Risk Level and show all Findings in details.
- The main UI is the Queue Table. It starts immediately after loading. Do not build a landing page.
- The Queue Table shows Scheduled Posts, channel, due time, Risk Level, and Findings.
- Clear Posts are visible but have no action button.
- Quarantine must ask for confirmation before creating a Draft Post.
- Quarantine creates a Safe Draft Replacement on the same Buffer channel as the risky Scheduled Post.
- Safe Draft Replacement text is `Needs review before publishing: {original first 80 characters}`.
- Use Buffer's `createPost` mutation with `saveToDraft: true` to create Draft Posts.
- OopsProof v1 does not delete Scheduled Posts. This is recorded in ADR-0001.
- Success copy is exactly: "Safe draft created. Remove the original scheduled post in Buffer."
- Failed Quarantine shows the Buffer error, leaves the original Scheduled Post untouched, and does not claim the risk was fixed.
- Do not store Quarantine History in v1. After refresh, fetch live Buffer data again.

Deep modules to build:

- **Buffer Connector**: hides Buffer GraphQL details behind simple methods. This protects the rest of the app from raw schema shape and makes API failures easier to handle.
- **Queue Model**: owns Queue Post normalization and scan-window rules. This keeps Buffer data cleanup separate from risk detection.
- **Risk Engine**: owns deterministic diagnosis. It should be pure, fast, and easy to test without Buffer credentials.
- **Quarantine Service**: owns the create-draft workflow, success/failure mapping, and same-channel draft behavior.
- **OopsProof UI**: owns loading, error, empty, table, details, confirmation, refresh, success, and failure states.

## Testing Decisions

- Good tests should check external behavior: inputs, outputs, visible states, and API contract handling. They should avoid testing private helper functions or implementation details.
- Test the Risk Engine heavily because it is deterministic and central to the product promise.
- Risk Engine tests should cover embargo term matches, case-insensitive matching, non-matches after the allowed date, stale relative date phrase matches, duplicate opening matches, multiple Findings, highest Risk Level selection, and Clear Posts.
- Queue Model tests should cover normalization from Buffer-shaped data into Queue Posts and filtering to the next 30 days.
- Quarantine Service tests should cover Safe Draft Replacement text, same-channel draft creation, success with Draft Post ID, and failure without false success.
- Buffer Connector tests should mock GraphQL responses and cover Bearer auth, GraphQL errors, `MutationError`, pagination, and invalid/missing API key handling.
- UI tests should cover missing key error, invalid key error, loading state, empty queue, Clear Post row with no action, risky post details, confirmation, draft success, draft failure, and manual Refresh.
- No live Buffer calls should be required for automated tests. Live testing with a real Buffer account is a manual verification step.
- There is no prior app test structure in this repo yet, so the first implementation should choose a test setup that fits the selected web stack.

## Out of Scope

- Deleting or removing Scheduled Posts from Buffer.
- Saying "Risk removed from queue" in v1.
- Fake posts, seeded data, demo fallback, or mock-only app behavior.
- AI judgment, AI caption generation, AI rewriting, or AI scoring.
- Editing Scheduled Posts in place.
- Inspecting Buffer ideas, existing drafts, sent posts, analytics, or arbitrary calendar content.
- OAuth, multi-user auth, or saved credentials.
- Organization picker.
- Channel picker.
- Settings UI for risk configuration.
- Media uploads.
- Calendar UI.
- Full Buffer clone.
- Analytics.
- Team approval workflows.
- Quarantine History or audit log.
- Missing-link checks, dangerous-claim checks, wrong-channel phrase checks, privacy leak checks, or other risk rules beyond the three v1 rules.

## Further Notes

- Official Buffer docs say the API is GraphQL, is available at `https://api.buffer.com`, supports post creation, post deletion, post retrieval, idea creation, account retrieval, organization retrieval, and channel retrieval, and requires Bearer auth.
- Official Buffer auth docs say API keys are account-based, can access all organizations and channels in the account, should be stored in environment variables, and should not be exposed in client-side code.
- Official Buffer data model docs describe Account -> Organizations -> Channels -> Posts, with Ideas belonging to Organizations.
- Official Buffer scheduled-post examples show querying `posts` with `filter: {status: [scheduled]}` and sorting by `dueAt`.
- Official Buffer draft examples show `createPost(input: { ..., saveToDraft: true })`.
- Official Buffer pagination docs show `pageInfo.hasNextPage` and `pageInfo.endCursor` and recommend page sizes around 20-50.
- Buffer Help says API access is available across Buffer plans, API keys are user-based, and the public API is focused on post creation and idea management, with analytics not currently available.

Sources:

- Buffer Quick Start: https://developers.buffer.com/guides/getting-started.html
- Buffer Authentication: https://developers.buffer.com/guides/authentication.html
- Buffer Data Model: https://developers.buffer.com/guides/data-model.html
- Buffer Posts & Scheduling: https://developers.buffer.com/guides/posts-and-scheduling.html
- Buffer Get Scheduled Posts: https://developers.buffer.com/examples/get-scheduled-posts.html
- Buffer Get Posts For Channels: https://developers.buffer.com/examples/get-posts-for-channels.html
- Buffer Create Draft Post: https://developers.buffer.com/examples/create-draft-post.html
- Buffer Pagination: https://developers.buffer.com/guides/pagination.html
- Buffer Help, Using Buffer's API: https://support.buffer.com/article/859-does-buffer-have-an-api
