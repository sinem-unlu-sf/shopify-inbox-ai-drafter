// Drafts a reply for every question in data/questions.csv and writes out/drafts.csv.
// Usage: npm run eval            (all 120)
//        npm run eval -- Q-001 Q-006   (just these)
import { mkdirSync, writeFileSync } from "node:fs";
import { getQuestions } from "../lib/catalog";
import { checkPilotFlag } from "../lib/pilot-gate";
import { draftReply, MODEL } from "../lib/drafter";

const only = process.argv.slice(2);
const qs = getQuestions().filter((q) => !only.length || only.includes(q.question_id));
const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function main() {
  const gate = await checkPilotFlag();
  if (!gate.enabled) { console.error(`Pilot flag off (${gate.reason}); nothing drafted or written.`); process.exit(1); }
  console.log(`Drafting ${qs.length} replies with ${MODEL}…`);
  const rows: string[] = [];
  const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || 3);
  for (let i = 0; i < qs.length; i += CONCURRENCY) {
    const batch = qs.slice(i, i + CONCURRENCY);
    const drafts = await Promise.all(batch.map((q) =>
      draftReply({ productId: q.product_id, question: q.question_text, firstName: q.shopper_first_name })
        .catch((e) => ({ reply: `ERROR: ${e.message}`, status: "error", page_evidence: [] as string[] }))));
    if (i + CONCURRENCY < qs.length) await new Promise((r) => setTimeout(r, Number(process.env.EVAL_DELAY_MS ?? 10_000)));
    batch.forEach((q, j) => {
      const d = drafts[j];
      console.log(`\n${q.question_id} [${q.product_id}] (${d.status}) page-answerable=${q.answerable_from_page}\n  Q: ${q.question_text}\n  A: ${d.reply}`);
      rows.push([q.question_id, q.product_id, q.question_text, q.answerable_from_page, d.status, d.reply, d.page_evidence.join(" | ")].map(esc).join(","));
    });
  }
  mkdirSync("out", { recursive: true });
  writeFileSync("out/drafts.csv", "question_id,product_id,question_text,answerable_from_page,status,reply,page_evidence\n" + rows.join("\n") + "\n");
  console.log("\nWrote out/drafts.csv");
}
main();
