import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { FLAG_KEY, STORE_GROUP, posthog } from "./posthog";

// Funnel for the unedited_send_rate bar:
//   ai_draft_sent_unchanged / ai_draft_created. Edited sends and discards stay in the denominator.
// Events are only emitted after the pilot flag check passed, and always carry the flag and the dev store group.
export const DRAFT_EVENTS = {
  created: "ai_draft_created",
  sentUnchanged: "ai_draft_sent_unchanged",
  sentEdited: "ai_draft_sent_edited",
  discarded: "ai_draft_discarded",
} as const;

export type Capture = (event: string, properties: Record<string, unknown>) => void;
const defaultCapture: Capture = (event, properties) =>
  posthog().capture({ distinctId: STORE_GROUP.store, event, groups: { ...STORE_GROUP }, properties });

type Opts = { capture?: Capture; secret?: string };
type Claims = { id: string; h: string; p: string; q: string | null; s: string; t: string };

// app_env separates local/preview test traffic from the production inbox; only production counts toward the bar.
const base = {
  [`$feature/${FLAG_KEY}`]: true, pilot_flag_enabled: true, store: STORE_GROUP.store,
  app_env: process.env.VERCEL_ENV ?? "local",
};
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const b64 = (t: string) => Buffer.from(t).toString("base64url");

function secretOf(opts: Opts) {
  const s = opts.secret ?? process.env.DRAFT_SIGNING_SECRET;
  if (!s || s.length < 16) throw new Error("DRAFT_SIGNING_SECRET is missing or shorter than 16 characters.");
  return s;
}
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

// Serverless instances share no memory, so the server hands the browser a signed token that holds a hash of the
// original draft. "Unchanged" is still decided on the server by comparing hashes; the browser cannot forge it.
export function recordDraftCreated(
  d: { reply: string; product_id: string; question_id?: string; draft_status: string; trigger?: string }, opts: Opts = {},
): { draft_id: string; token: string } {
  const claims: Claims = { id: randomUUID(), h: sha(d.reply), p: d.product_id, q: d.question_id ?? null, s: d.draft_status, t: d.trigger ?? "manual" };
  const body = b64(JSON.stringify(claims));
  const token = `${body}.${sign(body, secretOf(opts))}`;
  (opts.capture ?? defaultCapture)(DRAFT_EVENTS.created, { ...base, draft_id: claims.id, product_id: claims.p, question_id: claims.q, draft_status: claims.s, trigger: claims.t });
  return { draft_id: claims.id, token };
}

export type Outcome = "sent_unchanged" | "sent_edited" | "discarded";

/** Records what the merchant did with a draft. Count unique draft_id per outcome when computing the rate. */
export function recordDraftOutcome(token: string, action: "send" | "discard", finalReply: string | undefined, opts: Opts = {}): Outcome {
  const [body, mac] = String(token).split(".");
  const expected = sign(body ?? "", secretOf(opts));
  if (!body || !mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    throw new Error("invalid_draft_token");
  }
  const c: Claims = JSON.parse(Buffer.from(body, "base64url").toString());
  const outcome: Outcome = action === "discard" ? "discarded" : sha(finalReply ?? "") === c.h ? "sent_unchanged" : "sent_edited";
  const event = outcome === "discarded" ? DRAFT_EVENTS.discarded : outcome === "sent_unchanged" ? DRAFT_EVENTS.sentUnchanged : DRAFT_EVENTS.sentEdited;
  (opts.capture ?? defaultCapture)(event, { ...base, draft_id: c.id, product_id: c.p, question_id: c.q, draft_status: c.s, trigger: c.t });
  return outcome;
}

/** Serverless functions can freeze right after responding, so send queued events first. */
export async function flushEvents() {
  try { await posthog().flush(); } catch { /* analytics must never break a merchant action */ }
}
