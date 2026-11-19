import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPilotFlag, PilotDisabledError, type FlagClient } from "../lib/pilot-gate";
import { writeReply } from "../lib/reply-store";
import { draftReply } from "../lib/drafter";

const flag = (value: unknown): FlagClient => ({ getFeatureFlag: async () => value });
const throwing: FlagClient = { getFeatureFlag: async () => { throw new Error("500 from /flags"); } };
const row = { question_id: "Q-001", product_id: "DSP-003", reply: "Hi Maya!", approved: true };
const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), "pilot-")), "replies.jsonl");

test("flag enabled: reply can be written", async () => {
  assert.deepEqual(await checkPilotFlag(flag(true)), { enabled: true });
  const file = tmpFile();
  await writeReply(row, { flagClient: flag(true), file });
  assert.equal(JSON.parse(readFileSync(file, "utf8").trim()).question_id, "Q-001");
});

test("flag disabled: reply cannot be written", async () => {
  assert.deepEqual(await checkPilotFlag(flag(false)), { enabled: false, reason: "flag_disabled" });
  const file = tmpFile();
  await assert.rejects(writeReply(row, { flagClient: flag(false), file }), PilotDisabledError);
  assert.equal(existsSync(file), false);
});

test("PostHog unavailable (flag returns undefined): reply cannot be written", async () => {
  assert.deepEqual(await checkPilotFlag(flag(undefined)), { enabled: false, reason: "posthog_unavailable" });
  const file = tmpFile();
  await assert.rejects(writeReply(row, { flagClient: flag(undefined), file }), PilotDisabledError);
  assert.equal(existsSync(file), false);
});

test("PostHog unavailable (no project key): reply cannot be written", async () => {
  const saved = process.env.POSTHOG_PROJECT_KEY;
  delete process.env.POSTHOG_PROJECT_KEY;
  try {
    assert.deepEqual(await checkPilotFlag(), { enabled: false, reason: "posthog_unavailable" });
    const file = tmpFile();
    await assert.rejects(writeReply(row, { file }), PilotDisabledError);
    assert.equal(existsSync(file), false);
  } finally { if (saved !== undefined) process.env.POSTHOG_PROJECT_KEY = saved; }
});

test("PostHog unavailable (timeout): reply cannot be written", async () => {
  const hang: FlagClient = { getFeatureFlag: () => new Promise(() => {}) };
  const result = await Promise.race([checkPilotFlag(hang), new Promise((r) => setTimeout(() => r("still waiting"), 6000))]);
  assert.deepEqual(result, { enabled: false, reason: "posthog_unavailable" });
});

test("flag evaluation error: reply cannot be written", async () => {
  assert.deepEqual(await checkPilotFlag(throwing), { enabled: false, reason: "flag_evaluation_error" });
  const file = tmpFile();
  await assert.rejects(writeReply(row, { flagClient: throwing, file }), PilotDisabledError);
  assert.equal(existsSync(file), false);
});

test("non-boolean flag value (e.g. a variant string) is treated as off", async () => {
  assert.equal((await checkPilotFlag(flag("true"))).enabled, false);
});

test("flag on but reply not approved: reply cannot be written", async () => {
  const file = tmpFile();
  await assert.rejects(writeReply({ ...row, approved: false }, { flagClient: flag(true), file }), PilotDisabledError);
  assert.equal(existsSync(file), false);
});

test("drafter refuses to call the model when the flag is off", async () => {
  await assert.rejects(draftReply({ productId: "DSP-003", question: "almond?" }, { flagClient: flag(false) }), PilotDisabledError);
  await assert.rejects(draftReply({ productId: "DSP-003", question: "almond?" }, { flagClient: throwing }), PilotDisabledError);
});
