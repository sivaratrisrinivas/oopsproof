import assert from "node:assert/strict";
import { test } from "node:test";

import { assessQueuePosts } from "../src/riskEngine.js";

test("embargo term before allowed date creates a High Finding", () => {
  const [result] = assessQueuePosts([
    queuePost({
      id: "post-embargo",
      text: "LaunchKit ships soon",
      dueAt: "2026-06-30T12:00:00.000Z",
    }),
  ]);

  assert.equal(result.post.id, "post-embargo");
  assert.equal(result.riskLevel, "High");
  assert.equal(result.canQuarantine, true);
  assert.deepEqual(result.findings, [
    {
      rule: "Embargo Term Rule",
      riskLevel: "High",
      summary: "Mentions embargo term LaunchKit before 2026-07-01.",
    },
  ]);
});

test("embargo term matching is case-insensitive for the fixed Embargo Policy", () => {
  const [result] = assessQueuePosts([
    queuePost({
      text: "The acme partnership and series a announcement is almost ready",
      dueAt: "2026-06-30T12:00:00.000Z",
    }),
  ]);

  assert.equal(result.riskLevel, "High");
  assert.deepEqual(
    result.findings.map((finding) => finding.summary),
    [
      "Mentions embargo term Acme partnership before 2026-07-01.",
      "Mentions embargo term Series A before 2026-07-01.",
    ],
  );
});

test("embargo terms do not create Findings after the allowed date", () => {
  const [result] = assessQueuePosts([
    queuePost({
      text: "LaunchKit public launch day",
      dueAt: "2026-07-01T00:00:00.000Z",
    }),
  ]);

  assert.equal(result.riskLevel, "Clear");
  assert.equal(result.canQuarantine, false);
  assert.deepEqual(result.findings, []);
});

test("stale relative date phrases create Medium Findings", () => {
  const [result] = assessQueuePosts([
    queuePost({
      text: "Join us today and bring your questions this Friday",
      dueAt: "2026-07-02T12:00:00.000Z",
    }),
  ]);

  assert.equal(result.riskLevel, "Medium");
  assert.equal(result.canQuarantine, true);
  assert.deepEqual(result.findings, [
    {
      rule: "Stale Relative Date Rule",
      riskLevel: "Medium",
      summary: "Uses relative date phrase today, which can go stale before publishing.",
    },
    {
      rule: "Stale Relative Date Rule",
      riskLevel: "Medium",
      summary: "Uses relative date phrase this Friday, which can go stale before publishing.",
    },
  ]);
});

test("stale relative date rule uses the fixed v1 Relative Date Phrase List", () => {
  const [result] = assessQueuePosts([
    queuePost({
      text: "Yesterday we said tomorrow, but next week is the safer wording.",
      dueAt: "2026-07-02T12:00:00.000Z",
    }),
  ]);

  assert.deepEqual(
    result.findings.map((finding) => finding.summary),
    [
      "Uses relative date phrase tomorrow, which can go stale before publishing.",
      "Uses relative date phrase yesterday, which can go stale before publishing.",
      "Uses relative date phrase next week, which can go stale before publishing.",
    ],
  );
});

test("duplicate opening rule compares the first eight normalized words across Scheduled Posts", () => {
  const results = assessQueuePosts([
    queuePost({
      id: "post-a",
      text: "Launch notes for customers are ready to review before Monday",
    }),
    queuePost({
      id: "post-b",
      text: "Launch notes, for customers: are ready to review with a different ending",
    }),
  ]);

  assert.deepEqual(
    results.map((result) => result.riskLevel),
    ["Medium", "Medium"],
  );
  assert.deepEqual(
    results.map((result) => result.findings),
    [
      [
        {
          rule: "Duplicate Opening Rule",
          riskLevel: "Medium",
          summary: "Shares the same first 8 normalized words as another Scheduled Post.",
        },
      ],
      [
        {
          rule: "Duplicate Opening Rule",
          riskLevel: "Medium",
          summary: "Shares the same first 8 normalized words as another Scheduled Post.",
        },
      ],
    ],
  );
});

test("posts with multiple Findings summarize to the highest Risk Level and retain every Finding", () => {
  const [result] = assessQueuePosts([
    queuePost({
      id: "post-risky",
      text: "LaunchKit today plans are ready to review before Monday",
      dueAt: "2026-06-30T12:00:00.000Z",
    }),
    queuePost({
      id: "post-duplicate",
      text: "LaunchKit today plans are ready to review before adding a safer date",
      dueAt: "2026-07-02T12:00:00.000Z",
    }),
  ]);

  assert.equal(result.riskLevel, "High");
  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ["Embargo Term Rule", "Stale Relative Date Rule", "Duplicate Opening Rule"],
  );
  assert.deepEqual(
    result.findings.map((finding) => finding.riskLevel),
    ["High", "Medium", "Medium"],
  );
});

test("Clear Posts remain represented with no Findings and no action eligibility", () => {
  const [result] = assessQueuePosts([
    queuePost({
      text: "Feature notes are ready for customer review",
      dueAt: "2026-07-02T12:00:00.000Z",
    }),
  ]);

  assert.equal(result.riskLevel, "Clear");
  assert.equal(result.canQuarantine, false);
  assert.deepEqual(result.findings, []);
});

function queuePost(overrides = {}) {
  return {
    id: "post-1",
    text: "Clear scheduled post",
    channelId: "channel-1",
    channelName: "Founder X",
    service: "twitter",
    status: "scheduled",
    dueAt: "2026-06-10T12:00:00.000Z",
    createdAt: "2026-06-01T09:00:00.000Z",
    ...overrides,
  };
}
