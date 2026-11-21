import { test } from "node:test";
import assert from "node:assert/strict";
import { recordDraftCreated, recordDraftOutcome, DRAFT_EVENTS } from "../lib/draft-events";

const secret = "test-secret-0123456789";
function sink() { const ev: { event: string; p: Record<string, unknown> }[] = []; return { ev, capture: (event: string, p: Record<string, unknown>) => { ev.push({ event, p }); } }; }
const d = { reply: "Hi Ana, yes it contains shea butter.", product_id: "DSP-001", draft_status: "answered" };

test("unchanged send", () => {
  const { ev, capture } = sink();
  const { token, draft_id } = recordDraftCreated(d, { capture, secret });
  assert.equal(recordDraftOutcome(token, "send", d.reply, { capture, secret }), "sent_unchanged");
  assert.deepEqual(ev.map((e) => e.event), [DRAFT_EVENTS.created, DRAFT_EVENTS.sentUnchanged]);
  assert.equal(ev[1].p.draft_id, draft_id);
  assert.equal(ev[0].p["$feature/inbox-ai-reply-drafter"], true);
});
test("edited send and discard count separately", () => {
  const { capture } = sink();
  assert.equal(recordDraftOutcome(recordDraftCreated(d, { capture, secret }).token, "send", d.reply + " Thanks!", { capture, secret }), "sent_edited");
  assert.equal(recordDraftOutcome(recordDraftCreated(d, { capture, secret }).token, "discard", undefined, { capture, secret }), "discarded");
});
test("a tampered or foreign token is refused", () => {
  const { capture } = sink();
  const { token } = recordDraftCreated(d, { capture, secret });
  const [body] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), h: "x" })).toString("base64url");
  assert.throws(() => recordDraftOutcome(`${forged}.${token.split(".")[1]}`, "send", "anything", { capture, secret }), /invalid_draft_token/);
  assert.throws(() => recordDraftOutcome(token, "send", d.reply, { capture, secret: "another-secret-9876543210" }), /invalid_draft_token/);
});
