import assert from "node:assert/strict";
import { test } from "node:test";

import { createSafeDraftReplacement } from "../src/quarantineService.js";

test("Quarantine creates a same-channel Safe Draft Replacement with conservative text", async () => {
  const createdDrafts = [];
  const originalText =
    "LaunchKit ships today with an announcement that needs a careful human review before publishing";

  const result = await createSafeDraftReplacement({
    post: {
      id: "post-risky",
      text: originalText,
      channelId: "channel-x",
    },
    createDraftPost: async (draft) => {
      createdDrafts.push(draft);
      return { id: "draft-123" };
    },
  });

  assert.deepEqual(createdDrafts, [
    {
      channelId: "channel-x",
      text: `Needs review before publishing: ${originalText.slice(0, 80)}`,
    },
  ]);
  assert.deepEqual(result, {
    kind: "success",
    draftPostId: "draft-123",
    message: "Safe draft created. Remove the original scheduled post in Buffer.",
  });
});

test("Failed Quarantine shows the Buffer error without false success copy", async () => {
  const result = await createSafeDraftReplacement({
    post: {
      id: "post-risky",
      text: "LaunchKit ships today",
      channelId: "channel-x",
    },
    createDraftPost: async () => {
      throw new Error("Buffer draft creation failed");
    },
  });

  assert.deepEqual(result, {
    kind: "failed",
    message: "Failed Quarantine",
    detail: "Buffer draft creation failed",
  });
  assert.notEqual(result.message, "Safe draft created. Remove the original scheduled post in Buffer.");
});
