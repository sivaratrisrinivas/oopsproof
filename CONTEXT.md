# OopsProof

OopsProof is a publishing safety layer for Buffer queues. It helps users find risky scheduled posts and recover them into human-reviewable drafts before they publish.

## Language

**Scheduled Post**:
A Buffer post with a future publish time that can still be prevented from publishing. OopsProof inspects scheduled posts, not sent posts, ideas, or existing drafts.
_Avoid_: Queue item, calendar item, live post

**Draft Post**:
A Buffer post saved for human review and not scheduled to publish. OopsProof creates draft posts as the safe recovery destination for risky scheduled posts.
_Avoid_: Idea, correction, replacement post

**Safe Draft Replacement**:
A conservative draft post created on the same Buffer channel as the risky scheduled post to preserve a recovery path without publishing risky wording. In v1, its text is `Needs review before publishing: {original first 80 characters}`.
_Avoid_: Corrected post, rewritten post, generated caption

**Quarantine Success Message**:
The message shown after OopsProof creates a safe draft replacement. In v1, the success message is "Safe draft created. Remove the original scheduled post in Buffer."
_Avoid_: Risk removed from queue, fixed post

**Quarantine History**:
Past quarantine actions performed by OopsProof. OopsProof v1 does not store quarantine history; after refresh it fetches live Buffer data again.
_Avoid_: Audit log, action log

**Failed Quarantine**:
A quarantine attempt where Buffer did not create the safe draft replacement. OopsProof shows the error, leaves the original scheduled post untouched, and does not claim the risk was fixed.
_Avoid_: Partial success, silent failure

**Quarantine**:
The act of moving risk out of the live scheduled queue by creating a safe draft replacement. OopsProof v1 does not remove the original scheduled post; it tells the user to remove that post in Buffer after the draft is created.
_Avoid_: Rewrite, approve, publish, auto-fix

**Quarantine Confirmation**:
The user's explicit approval before OopsProof creates a safe draft replacement for a risky scheduled post. The confirmation must explain that the original scheduled post will remain in Buffer and must be removed manually.
_Avoid_: One-click fix, auto-remediation

**Risk Rule**:
A deterministic check that can flag a scheduled post as risky. OopsProof v1 uses only the embargo term rule, stale relative date rule, and duplicate opening rule.
_Avoid_: AI judgment, compliance rule, policy

**Deterministic Diagnosis**:
Risk detection based only on explicit rules that users can understand. OopsProof v1 does not use AI to judge, rewrite, or generate posts.
_Avoid_: AI review, model scoring, smart rewrite

**Risk Level**:
The urgency label assigned to a finding. OopsProof v1 uses High for embargo term findings and Medium for stale relative date or duplicate opening findings.
_Avoid_: Score, confidence, priority

**Finding**:
A specific reason a scheduled post was flagged by a risk rule. When a post has multiple findings, OopsProof summarizes the post by its highest risk level while still showing every finding in the details.
_Avoid_: Warning, issue, alert

**Embargo Term Rule**:
A risk rule that flags a scheduled post when it mentions a configured embargo term before the configured embargo date.
_Avoid_: Launch detector, secret detector

**Stale Relative Date Rule**:
A risk rule that flags a scheduled post when it contains configured relative-date language such as "today", "tomorrow", "yesterday", "this Friday", or "next week".
_Avoid_: Date validation, calendar check

**Duplicate Opening Rule**:
A risk rule that flags scheduled posts whose first eight normalized words match another scheduled post.
_Avoid_: Duplicate post check, similarity scan

**Embargo Policy**:
The configured set of embargo terms and the date before which those terms should not appear in scheduled posts.
_Avoid_: Launch settings, blocked words

**Duplicate Opening Window**:
The configured number of normalized opening words used by the duplicate opening rule. OopsProof v1 uses the first eight normalized words.
_Avoid_: Similarity threshold

**Relative Date Phrase List**:
The configured phrases that the stale relative date rule treats as timing risks in scheduled posts.
_Avoid_: Date parser, temporal intelligence

**Live Buffer Data**:
Real scheduled posts fetched from the user's Buffer account. OopsProof v1 does not use fake posts or a sample-data fallback.
_Avoid_: Seed data, mock posts, demo fallback

**Local Buffer API Key**:
A Buffer API key stored in the project's local `.env` file and read when the app starts. The key is not entered through the app UI, must not be committed to the repo, and missing or invalid keys stop the app from loading Buffer data.
_Avoid_: User login, OAuth, saved credential

**Buffer Organization**:
The single Buffer organization OopsProof v1 reads scheduled posts from. If Buffer returns multiple organizations, v1 uses the first organization and shows its name clearly.
_Avoid_: Workspace, team, account

**Channel Scope**:
The set of Buffer channels OopsProof scans for scheduled posts. In v1, the channel scope is every channel in the selected Buffer organization.
_Avoid_: Selected profile, social account filter

**Scan Window**:
The future time range OopsProof inspects for scheduled posts. OopsProof v1 scans scheduled posts due in the next 30 days.
_Avoid_: Calendar range, full history

**Queue Table**:
The main view of OopsProof, showing scheduled posts, their Buffer channel, due time, risk level, and findings. OopsProof v1 starts directly on the queue table after loading.
_Avoid_: Landing page, dashboard, calendar

**Refresh**:
The user's manual request to fetch live Buffer data again. OopsProof v1 does not auto-refresh the queue.
_Avoid_: Live sync, polling

**Empty Queue**:
The state where Buffer returns no scheduled posts in the scan window. OopsProof v1 shows "No scheduled posts found in the next 30 days" and does not use fake posts.
_Avoid_: Demo mode, sample queue

**Clear Post**:
A scheduled post with no findings from the v1 risk rules. OopsProof shows clear posts for context but does not offer actions for them.
_Avoid_: Safe post, approved post

## Example Dialogue

**Dev**: "Should OopsProof scan Buffer ideas too?"

**Domain Expert**: "No. In v1 it scans scheduled posts because those can publish if nobody intervenes."

**Dev**: "When a scheduled post is risky, do we edit it in place?"

**Domain Expert**: "No. We quarantine it by creating a draft post for review. In v1, the original scheduled post stays in Buffer and the user removes it manually."

**Dev**: "Should the draft say the corrected launch message?"

**Domain Expert**: "No. The safe draft replacement should be a conservative review placeholder, not a generated correction."

**Dev**: "Should we add missing-link and privacy-leak checks now?"

**Domain Expert**: "No. OopsProof v1 has exactly three deterministic risk rules: embargo term, stale relative date, and duplicate opening."

**Dev**: "Can users configure risk rules in the app?"

**Domain Expert**: "Not in v1. The demo uses a fixed risk configuration and shows the active configuration so the findings are explainable."

**Dev**: "Can the app show fake posts if the Buffer API key is missing?"

**Domain Expert**: "No. OopsProof v1 must use live Buffer data only."

**Dev**: "Should users paste the Buffer API key into the app?"

**Domain Expert**: "No. For v1 the key lives in the local `.env` file and the app reads it on startup."

**Dev**: "Should the app show fake data if the API key fails?"

**Domain Expert**: "No. It should show a clear missing or invalid key error and stop."

**Dev**: "Should users choose between multiple Buffer organizations?"

**Domain Expert**: "No. OopsProof v1 starts with one Buffer organization."

**Dev**: "Should users pick a channel before scanning?"

**Domain Expert**: "No. OopsProof v1 scans every channel in the selected Buffer organization."

**Dev**: "How much of the queue should the app inspect?"

**Domain Expert**: "OopsProof v1 inspects scheduled posts due in the next 30 days."

**Dev**: "Can users edit or quarantine posts that have no risk?"

**Domain Expert**: "No. Clear posts are shown for context only."
