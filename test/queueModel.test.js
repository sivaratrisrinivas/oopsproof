import assert from "node:assert/strict";
import { test } from "node:test";

import { buildQueuePosts } from "../src/queueModel.js";

test("Queue Model normalizes Buffer-shaped posts and filters to the next 30 days", () => {
  const posts = buildQueuePosts({
    now: new Date("2026-06-04T00:00:00.000Z"),
    channels: [{ id: "channel-x", name: "Founder X", service: "twitter" }],
    posts: [
      {
        id: "post-in-window",
        text: "LaunchKit ships soon",
        channelId: "channel-x",
        status: "scheduled",
        dueAt: "2026-06-10T12:00:00.000Z",
        createdAt: "2026-06-01T09:00:00.000Z",
      },
      {
        id: "post-too-late",
        text: "Outside scan window",
        channelId: "channel-x",
        status: "scheduled",
        dueAt: "2026-07-05T00:00:00.000Z",
        createdAt: "2026-06-01T09:00:00.000Z",
      },
      {
        id: "post-too-early",
        text: "Already published by the scan start",
        channelId: "channel-x",
        status: "scheduled",
        dueAt: "2026-06-03T23:59:59.000Z",
        createdAt: "2026-06-01T09:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(posts, [
    {
      id: "post-in-window",
      text: "LaunchKit ships soon",
      channelId: "channel-x",
      channelName: "Founder X",
      service: "twitter",
      status: "scheduled",
      dueAt: "2026-06-10T12:00:00.000Z",
      createdAt: "2026-06-01T09:00:00.000Z",
    },
  ]);
});
