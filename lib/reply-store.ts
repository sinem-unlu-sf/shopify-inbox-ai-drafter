import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { checkPilotFlag, PilotDisabledError, type FlagClient } from "./pilot-gate";

// The ONE place a drafted reply is persisted. Every writer must go through writeReply.
// It re-checks the pilot flag on every call and refuses the write when it is not explicitly on.
export type StoredReply = { question_id: string; product_id: string; reply: string; approved: boolean };

export const REPLY_STORE = path.join(process.cwd(), "out", "pilot-replies.jsonl");

export async function writeReply(row: StoredReply, opts: { flagClient?: FlagClient | null; file?: string } = {}) {
  const gate = await checkPilotFlag(opts.flagClient);
  if (!gate.enabled) throw new PilotDisabledError(gate.reason);
  if (!row.approved) throw new PilotDisabledError("not_approved"); // never persist a rejected reply
  const file = opts.file ?? REPLY_STORE;
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ ...row, written_at: new Date().toISOString() }) + "\n");
}
