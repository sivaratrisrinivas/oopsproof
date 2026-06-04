import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

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
  assert.match(response.body, /Loading live Buffer data/);
});
