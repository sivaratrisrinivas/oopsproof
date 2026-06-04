import assert from "node:assert/strict";
import { test } from "node:test";

import { BufferClientError, createDraftPost, loadLiveBufferQueue } from "../src/bufferClient.js";

test("rejects a missing Local Buffer API Key before issuing Buffer requests", async () => {
  let requestCount = 0;

  await assert.rejects(
    loadLiveBufferQueue({
      bufferApiKey: "   ",
      fetch: async () => {
        requestCount += 1;
        return jsonResponse({ data: {} });
      },
    }),
    (error) => {
      assert.ok(error instanceof BufferClientError);
      assert.equal(error.kind, "missing-key");
      assert.equal(error.message, "Missing Local Buffer API Key");
      return true;
    },
  );

  assert.equal(requestCount, 0);
});

test("loads the first Buffer Organization, scans all channels, and normalizes Scheduled Posts", async () => {
  const requests = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });

    if (body.query.includes("GetOrganizations")) {
      return jsonResponse({
        data: {
          account: {
            organizations: [
              { id: "org-first", name: "Launch Team" },
              { id: "org-second", name: "Other Team" },
            ],
          },
        },
      });
    }

    if (body.query.includes("GetChannels")) {
      assert.equal(body.variables.organizationId, "org-first");
      return jsonResponse({
        data: {
          channels: [
            { id: "channel-x", name: "Founder X", service: "twitter" },
            { id: "channel-linkedin", name: "Company LinkedIn", service: "linkedin" },
          ],
        },
      });
    }

    if (body.query.includes("GetScheduledPosts")) {
      assert.deepEqual(body.variables.channelIds, ["channel-x", "channel-linkedin"]);
      return jsonResponse({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "post-1",
                  text: "LaunchKit ships soon",
                  channelId: "channel-x",
                  status: "scheduled",
                  dueAt: "2026-06-10T12:00:00.000Z",
                  createdAt: "2026-06-01T09:00:00.000Z",
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }

    throw new Error(`Unexpected query: ${body.query}`);
  };

  const queue = await loadLiveBufferQueue({
    bufferApiKey: "server-key",
    fetch,
    now: new Date("2026-06-04T00:00:00.000Z"),
  });

  assert.equal(queue.organization.id, "org-first");
  assert.equal(queue.organization.name, "Launch Team");
  assert.deepEqual(queue.channels.map((channel) => channel.id), ["channel-x", "channel-linkedin"]);
  assert.deepEqual(queue.posts, [
    {
      id: "post-1",
      text: "LaunchKit ships soon",
      channelId: "channel-x",
      channelName: "Founder X",
      service: "twitter",
      status: "scheduled",
      dueAt: "2026-06-10T12:00:00.000Z",
      createdAt: "2026-06-01T09:00:00.000Z",
    },
  ]);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.url === "https://api.buffer.com"));
  assert.ok(
    requests.every((request) => request.options.headers.Authorization === "Bearer server-key"),
  );
});

test("paginates Scheduled Posts with opaque cursors and returns Queue Posts sorted by due time", async () => {
  const postVariables = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);

    if (body.query.includes("GetOrganizations")) {
      return jsonResponse({
        data: {
          account: {
            organizations: [{ id: "org-first", name: "Launch Team" }],
          },
        },
      });
    }

    if (body.query.includes("GetChannels")) {
      return jsonResponse({
        data: {
          channels: [{ id: "channel-x", name: "Founder X", service: "twitter" }],
        },
      });
    }

    if (body.query.includes("GetScheduledPosts")) {
      postVariables.push(body.variables);

      if (!body.variables.after) {
        return jsonResponse({
          data: {
            posts: {
              edges: [
                {
                  node: {
                    id: "post-later",
                    text: "Later post",
                    channelId: "channel-x",
                    status: "scheduled",
                    dueAt: "2026-06-20T12:00:00.000Z",
                    createdAt: "2026-06-01T09:00:00.000Z",
                  },
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: "opaque-cursor-1" },
            },
          },
        });
      }

      assert.equal(body.variables.after, "opaque-cursor-1");
      return jsonResponse({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "post-earlier",
                  text: "Earlier post",
                  channelId: "channel-x",
                  status: "scheduled",
                  dueAt: "2026-06-05T12:00:00.000Z",
                  createdAt: "2026-06-02T09:00:00.000Z",
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: "opaque-cursor-2" },
          },
        },
      });
    }

    throw new Error(`Unexpected query: ${body.query}`);
  };

  const queue = await loadLiveBufferQueue({
    bufferApiKey: "server-key",
    fetch,
    now: new Date("2026-06-04T00:00:00.000Z"),
  });

  assert.deepEqual(
    postVariables.map((variables) => variables.after),
    [null, "opaque-cursor-1"],
  );
  assert.equal(postVariables[0].first, 50);
  assert.equal(postVariables[0].dueAfter, "2026-06-04T00:00:00.000Z");
  assert.equal(postVariables[0].dueBefore, "2026-07-04T00:00:00.000Z");
  assert.deepEqual(
    queue.posts.map((post) => post.id),
    ["post-earlier", "post-later"],
  );
});

test("normalizes invalid Buffer API key GraphQL errors", async () => {
  const fetch = async () =>
    jsonResponse({
      data: null,
      errors: [
        {
          message: "Not authorized",
          extensions: { code: "UNAUTHORIZED" },
        },
      ],
    });

  await assert.rejects(
    loadLiveBufferQueue({ bufferApiKey: "bad-key", fetch }),
    (error) => {
      assert.ok(error instanceof BufferClientError);
      assert.equal(error.kind, "invalid-key");
      assert.equal(error.message, "Not authorized");
      return true;
    },
  );
});

test("normalizes Buffer GraphQL errors that are not auth failures", async () => {
  const fetch = async () =>
    jsonResponse({
      data: null,
      errors: [
        {
          message: "Rate limit exceeded",
          extensions: { code: "RATE_LIMIT_EXCEEDED" },
        },
      ],
    });

  await assert.rejects(
    loadLiveBufferQueue({ bufferApiKey: "server-key", fetch }),
    (error) => {
      assert.ok(error instanceof BufferClientError);
      assert.equal(error.kind, "graphql");
      assert.equal(error.message, "Rate limit exceeded");
      return true;
    },
  );
});

test("creates a Draft Post through Buffer createPost with saveToDraft enabled", async () => {
  let requestBody;
  const fetch = async (url, options) => {
    requestBody = JSON.parse(options.body);

    return jsonResponse({
      data: {
        createPost: {
          post: {
            id: "draft-123",
          },
        },
      },
    });
  };

  const draft = await createDraftPost({
    bufferApiKey: "server-key",
    fetch,
    channelId: "channel-x",
    text: "Needs review before publishing: LaunchKit ships today",
  });

  assert.equal(draft.id, "draft-123");
  assert.match(requestBody.query, /mutation CreateDraftPost/);
  assert.deepEqual(requestBody.variables.input, {
    channelId: "channel-x",
    text: "Needs review before publishing: LaunchKit ships today",
    saveToDraft: true,
  });
});

test("normalizes Buffer MutationError responses from draft creation", async () => {
  const fetch = async () =>
    jsonResponse({
      data: {
        createPost: {
          post: null,
          mutationErrors: [{ message: "Text is too long" }],
        },
      },
    });

  await assert.rejects(
    createDraftPost({
      bufferApiKey: "server-key",
      fetch,
      channelId: "channel-x",
      text: "Needs review before publishing: LaunchKit ships today",
    }),
    (error) => {
      assert.ok(error instanceof BufferClientError);
      assert.equal(error.kind, "mutation");
      assert.equal(error.message, "Text is too long");
      return true;
    },
  );
});

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}
