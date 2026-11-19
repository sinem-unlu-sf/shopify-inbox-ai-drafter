// Drafts all 120 questions (unless out/drafts.csv already has them), then grades each with the judge model.
// Outputs: out/graded.csv, out/graded.json, out/summary.md
// Usage: npm run grade            (use existing out/drafts.csv if complete, else draft first)
//        npm run grade -- --redraft
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../lib/csv";
import { getProduct, getQuestions, renderProductPage } from "../lib/catalog";
import { draftReply } from "../lib/drafter";
import { judgeReply, type JudgeResult } from "../lib/judge";
import { DRAFTER_MODEL, JUDGE_MODEL } from "../lib/llm";

const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || 6);
const questions = getQuestions();
const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function pool<T, R>(items: T[], fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function getDrafts(): Promise<Map<string, { reply: string; status: string }>> {
  const file = "out/drafts.csv";
  if (!process.argv.includes("--redraft") && existsSync(file)) {
    const rows = parseCsv(readFileSync(file, "utf8"));
    if (rows.length === questions.length && rows.every((r) => !r.reply.startsWith("ERROR"))) {
      console.log(`Using existing ${file} (${rows.length} drafts).`);
      return new Map(rows.map((r) => [r.question_id, { reply: r.reply, status: r.status }]));
    }
  }
  console.log(`Drafting ${questions.length} replies with ${DRAFTER_MODEL}…`);
  let done = 0;
  const drafts = await pool(questions, async (q) => {
    const d = await draftReply({ productId: q.product_id, question: q.question_text, firstName: q.shopper_first_name });
    if (++done % 10 === 0) console.log(`  drafted ${done}/${questions.length}`);
    return d;
  });
  mkdirSync("out", { recursive: true });
  writeFileSync(file, "question_id,product_id,question_text,answerable_from_page,status,reply,page_evidence\n" +
    questions.map((q, i) => [q.question_id, q.product_id, q.question_text, q.answerable_from_page, drafts[i].status, drafts[i].reply, drafts[i].page_evidence.join(" | ")].map(esc).join(",")).join("\n") + "\n");
  return new Map(questions.map((q, i) => [q.question_id, drafts[i]]));
}

async function main() {
  const drafts = await getDrafts();
  console.log(`Judging ${questions.length} replies with ${JUDGE_MODEL} (drafter: ${DRAFTER_MODEL})…`);
  let done = 0;
  const results = await pool(questions, async (q) => {
    const product = getProduct(q.product_id);
    const reply = drafts.get(q.question_id)!.reply;
    let j: JudgeResult | null = null, judge_error = "";
    try {
      j = await judgeReply({ firstName: q.shopper_first_name, question: q.question_text, note: q.expected_answer_note, page: product ? renderProductPage(product) : "(no product page found)", reply });
    } catch (e) { judge_error = (e as Error).message; }
    if (++done % 10 === 0) console.log(`  judged ${done}/${questions.length}`);
    const send_ready = j ? (j.send_ready_score >= 70 ? "PASS" : "FAIL") : "";
    const reasons: string[] = [];
    if (!j) reasons.push("judge error");
    else {
      if (j.invented_ingredient === "FAIL") reasons.push("invented_ingredient");
      if (j.honest_unknown === "FAIL") reasons.push("honest_unknown");
      if (send_ready === "FAIL") reasons.push(`send_ready ${j.send_ready_score}<70`);
    }
    return {
      question_id: q.question_id, product_id: q.product_id, question: q.question_text,
      expected_answer_note: q.expected_answer_note, generated_reply: reply, drafter_status: drafts.get(q.question_id)!.status,
      invented_ingredient: j?.invented_ingredient ?? "", invented_ingredient_explanation: j?.invented_ingredient_explanation ?? "",
      honest_unknown: j?.honest_unknown ?? "", honest_unknown_explanation: j?.honest_unknown_explanation ?? "",
      send_ready_score: j?.send_ready_score ?? "", send_ready, send_ready_explanation: j?.send_ready_explanation ?? "",
      note_conflicts_page: j?.note_conflicts_page ?? "", note_conflict_explanation: j?.note_conflict_explanation ?? "",
      overall: reasons.length ? "REJECTED" : "APPROVED", rejection_reasons: reasons.join("; "), judge_error,
    };
  });

  // Verification: exactly 120 rows, all three checks completed for each.
  const complete = results.filter((r) => r.invented_ingredient && r.honest_unknown && r.send_ready_score !== "");
  const ok = results.length === 120 && complete.length === 120;

  mkdirSync("out", { recursive: true });
  const cols = Object.keys(results[0]);
  writeFileSync("out/graded.csv", cols.join(",") + "\n" + results.map((r) => cols.map((c) => esc((r as any)[c])).join(",")).join("\n") + "\n");
  const approved = results.filter((r) => r.overall === "APPROVED");
  const rejected = results.filter((r) => r.overall === "REJECTED");
  const count = (k: string) => rejected.filter((r) => r.rejection_reasons.includes(k)).length;
  const conflicts = results.filter((r) => r.note_conflicts_page === true).length;
  const summary = {
    drafter_model: DRAFTER_MODEL, judge_model: JUDGE_MODEL, rows_evaluated: results.length, rows_fully_checked: complete.length,
    verification: ok ? "PASS: 120 rows, all three checks completed" : "FAIL: incomplete evaluation",
    approved: approved.length, rejected: rejected.length,
    rejections_by_check: { invented_ingredient: count("invented_ingredient"), honest_unknown: count("honest_unknown"), send_ready: count("send_ready"), judge_error: count("judge error") },
    notes_conflicting_with_page: conflicts,
  };
  writeFileSync("out/graded.json", JSON.stringify({ summary, rows: results }, null, 2));
  const md = [
    `# Grading summary`, ``,
    `- Drafter: \`${DRAFTER_MODEL}\` · Judge: \`${JUDGE_MODEL}\``,
    `- Rows evaluated: ${results.length} · fully checked: ${complete.length} · **${summary.verification}**`,
    `- **Approved: ${approved.length}** · **Rejected: ${rejected.length}**`,
    `- Rejections by check: invented_ingredient ${summary.rejections_by_check.invented_ingredient}, honest_unknown ${summary.rejections_by_check.honest_unknown}, send_ready ${summary.rejections_by_check.send_ready}, judge error ${summary.rejections_by_check.judge_error}`,
    `- Reference notes that conflict with the product page: ${conflicts}`, ``,
    `## Rejected replies`, ``, `| Question | Reason | Judge explanation |`, `|---|---|---|`,
    ...rejected.map((r) => `| ${r.question_id} | ${r.rejection_reasons} | ${[
      r.invented_ingredient === "FAIL" ? r.invented_ingredient_explanation : "",
      r.honest_unknown === "FAIL" ? r.honest_unknown_explanation : "",
      r.send_ready === "FAIL" ? r.send_ready_explanation : "", r.judge_error,
    ].filter(Boolean).join(" ").replace(/\|/g, "/").replace(/\n/g, " ")} |`),
  ].join("\n");
  writeFileSync("out/summary.md", md + "\n");
  console.log("\n" + md.split("\n## ")[0]);
  console.log("\nWrote out/graded.csv, out/graded.json, out/summary.md");
  if (!ok) process.exitCode = 1;
}
main();
