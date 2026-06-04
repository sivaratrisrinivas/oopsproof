import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { BufferClientError } from "../src/bufferClient.js";
import { createOopsProofResponse } from "../src/server.js";

test("initial route shows missing Local Buffer API Key state without fake fallback data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oopsproof-"));

  const response = await createOopsProofResponse({
    env: {},
    envFilePath: join(directory, ".env"),
    loadBufferData: async () => {
      throw new Error("Buffer data should not load without a Local Buffer API Key");
    },
  });

  const html = response.body;

  assert.equal(response.status, 200);
  assert.match(html, /OopsProof/);
  assert.match(html, /Queue Table/);
  assert.match(html, /Missing Local Buffer API Key/);
  assert.match(html, /Add BUFFER_API_KEY to your local \.env file/);
  assert.doesNotMatch(html, /fake post|seeded post|demo fallback/i);
});

test("Local Buffer API Key is read from .env for server-side loading without appearing in browser output", async () => {
  const secret = "buffer_secret_for_test";
  const directory = await mkdtemp(join(tmpdir(), "oopsproof-"));
  const envFilePath = join(directory, ".env");
  await writeFile(envFilePath, `BUFFER_API_KEY=${secret}\n`, "utf8");

  let loadedWithKey = "";
  const response = await createOopsProofResponse({
    env: {},
    envFilePath,
    loadBufferData: async ({ bufferApiKey }) => {
      loadedWithKey = bufferApiKey;
      return { posts: [] };
    },
  });

  assert.equal(loadedWithKey, secret);
  assert.doesNotMatch(response.body, new RegExp(secret));
  assert.match(response.body, /Queue Table/);
  assert.match(response.body, /Loaded live Buffer data/);
});

test("initial route shows selected Buffer Organization and normalized Scheduled Posts", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      channels: [{ id: "channel-x", name: "Founder X", service: "twitter" }],
      posts: [
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
      ],
    }),
  });

  assert.match(response.body, /Selected Buffer Organization/);
  assert.match(response.body, /Launch Team/);
  assert.match(response.body, /LaunchKit ships soon/);
  assert.match(response.body, /Founder X/);
  assert.match(response.body, /twitter/);
  assert.match(response.body, /scheduled/);
  assert.match(response.body, /2026-06-10T12:00:00.000Z/);
});

test("initial route shows invalid Local Buffer API Key state for Buffer auth failures", async () => {
  const secret = "bad_buffer_secret";
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: secret },
    loadBufferData: async () => {
      throw new BufferClientError("invalid-key", "Not authorized");
    },
  });

  assert.match(response.body, /Invalid Local Buffer API Key/);
  assert.match(response.body, /Buffer rejected the Local Buffer API Key/);
  assert.match(response.body, /Stopped before loading Buffer data/);
  assert.doesNotMatch(response.body, new RegExp(secret));
});
