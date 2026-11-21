// Pilot replay: re-grades the 120 drafted replies in out/graded.json with the existing judge,
// sends each through the gated write path, and reports to PostHog. No drafts are regenerated, nothing is sent to shoppers.
// Usage: npm run replay
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getProduct, getQuestions, renderProductPage } from "../lib/catalog";
import { judgeReply, type JudgeResult } from "../lib/judge";
import { JUDGE_MODEL } from "../lib/llm";
import { checkPilotFlag, PilotDisabledError } from "../lib/pilot-gate";
import { writeReply, REPLY_STORE } from "../lib/reply-store";
import { posthog, FLAG_KEY, STORE_GROUP } from "../lib/posthog";
import { FALLBACK } from "../lib/prompt";

const DATASET = "data/questions.csv";
const ANSWERS = "out/graded.json";
const RUN_ID = randomUUID();
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || 6);
const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const ph = posthog();
const emitted: Record<string, number> = {};
function track(event: string, properties: Record<string, unknown>) {
  // IDs and verdicts only: no keys, names, question text or reply text.
  ph.capture({
    distinctId: STORE_GROUP.store, event, groups: { ...STORE_GROUP },
    properties: { replay_run_id: RUN_ID, [`$feature/${FLAG_KEY}`]: properties.pilot_flag_enabled, ...properties },
  });
  emitted[event] = (emitted[event] ?? 0) + 1;
}

async function main() {
  const questions = getQuestions();
  const answers: { question_id: string; generated_reply: string }[] = JSON.parse(readFileSync(ANSWERS, "utf8")).rows;
  if (questions.length !== 120 || answers.length !== 120 || questions.some((q, i) => q.question_id !== answers[i].question_id)) {
    throw new Error("Dataset and original answers must be the same 120 question IDs in the same order.");
  }
  rmSync(REPLY_STORE, { force: true });
  const startGate = await checkPilotFlag();
  console.log(`Replay ${RUN_ID}: ${questions.length} questions from ${DATASET}, judge ${JUDGE_MODEL}, flag ${startGate.enabled ? "ON" : `OFF (${(startGate as any).reason})`}`);
  track("reply_drafter_pilot_replay_started", { pilot_flag_enabled: startGate.enabled, question_count: questions.length });

  let next = 0, done = 0;
  const rows: any[] = new Array(questions.length);
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < questions.length) {
      const i = next++, q = questions[i], reply = answers[i].generated_reply;
      let j: JudgeResult | null = null, judge_error = "";
      try {
        j = await judgeReply({ firstName: q.shopper_first_name, question: q.question_text, note: q.expected_answer_note, page: renderProductPage(getProduct(q.product_id)!), reply });
      } catch (e) { judge_error = (e as Error).message; }
      const send_ready_pass = !!j && j.send_ready_score >= 70;
      const overall_pass = !!j && j.invented_ingredient === "PASS" && j.honest_unknown === "PASS" && send_ready_pass;

      // Gated write: re-checks the flag; refuses when off/unavailable/error or when the reply is not approved.
      let written = false, block_reason = "";
      try { await writeReply({ question_id: q.question_id, product_id: q.product_id, reply, approved: overall_pass }); written = true; }
      catch (e) { if (e instanceof PilotDisabledError) block_reason = e.reason; else throw e; }
      const gate_on = block_reason === "" || block_reason === "not_approved";

      // honest_unknown_answers bar: unanswerable questions must get the approved sentence exactly.
      const answerable_from_page = q.answerable_from_page.trim().toLowerCase() !== "false";
      const props = {
        question_id: q.question_id, pilot_flag_enabled: gate_on, answerable_from_page,
        honest_unknown_exact: answerable_from_page ? null : reply === FALLBACK,
        invented_ingredient_pass: j ? j.invented_ingredient === "PASS" : null,
        honest_unknown_pass: j ? j.honest_unknown === "PASS" : null,
        send_ready_score: j?.send_ready_score ?? null, send_ready_pass, overall_pass,
      };
      track("reply_drafter_pilot_question_evaluated", props);
      if (!written) track("reply_drafter_pilot_reply_blocked", { ...props, block_reason });

      rows[i] = {
        question_id: q.question_id, product_id: q.product_id, expected_answer_note: q.expected_answer_note, generated_reply: reply,
        invented_ingredient: j?.invented_ingredient ?? "", invented_ingredient_explanation: j?.invented_ingredient_explanation ?? "",
        honest_unknown: j?.honest_unknown ?? "", honest_unknown_explanation: j?.honest_unknown_explanation ?? "",
        send_ready_score: j?.send_ready_score ?? "", send_ready: j ? (send_ready_pass ? "PASS" : "FAIL") : "", send_ready_explanation: j?.send_ready_explanation ?? "",
        answerable_from_page, honest_unknown_exact: props.honest_unknown_exact,
        overall: overall_pass ? "APPROVED" : "REJECTED", written_to_store: written, block_reason, judge_error,
      };
      if (++done % 20 === 0) console.log(`  ${done}/${questions.length}`);
    }
  }));

  const ids = rows.map((r) => r.question_id);
  const complete = rows.filter((r) => r.invented_ingredient && r.honest_unknown && r.send_ready_score !== "").length;
  const summary = {
    replay_run_id: RUN_ID, dataset: DATASET, original_answers: ANSWERS, judge_model: JUDGE_MODEL, flag_key: FLAG_KEY,
    questions_replayed: rows.length, unique_ids: new Set(ids).size, fully_evaluated: complete,
    failed_evaluations: rows.filter((r) => r.judge_error).map((r) => r.question_id),
    approved: rows.filter((r) => r.overall === "APPROVED").length, rejected: rows.filter((r) => r.overall === "REJECTED").length,
    written_to_store: rows.filter((r) => r.written_to_store).length,
    blocked: rows.filter((r) => !r.written_to_store).length,
    blocked_by_reason: rows.reduce((a: any, r) => (r.block_reason && (a[r.block_reason] = (a[r.block_reason] ?? 0) + 1), a), {}),
    rejections_by_check: {
      invented_ingredient: rows.filter((r) => r.invented_ingredient === "FAIL").length,
      honest_unknown: rows.filter((r) => r.honest_unknown === "FAIL").length,
      send_ready: rows.filter((r) => r.send_ready === "FAIL").length,
    },
    honest_unknown_exact: { unanswerable: rows.filter((r) => !r.answerable_from_page).length, exact: rows.filter((r) => r.honest_unknown_exact === true).length },
    production_messages_sent: 0,
    events_emitted_locally: {} as Record<string, number>,
  };
  track("reply_drafter_pilot_replay_completed", {
    pilot_flag_enabled: startGate.enabled, questions_evaluated: summary.fully_evaluated,
    approved: summary.approved, rejected: summary.rejected, blocked: summary.blocked,
  });
  await ph.shutdown();
  summary.events_emitted_locally = emitted;

  mkdirSync("out", { recursive: true });
  const cols = Object.keys(rows[0]);
  writeFileSync("out/pilot-replay.csv", cols.join(",") + "\n" + rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n") + "\n");
  writeFileSync("out/pilot-replay.json", JSON.stringify({ summary, rows }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (rows.length !== 120 || summary.unique_ids !== 120 || complete !== 120) process.exitCode = 1;
}
main();
