import { generateObject } from "ai";
import { z } from "zod";
import { JUDGE_MODEL, DRAFTER_MODEL, model } from "./llm";

if (JUDGE_MODEL && JUDGE_MODEL === DRAFTER_MODEL) {
  throw new Error("JUDGE_MODEL must differ from DRAFTER_MODEL so the grader isn't marking its own work.");
}

export const JudgeSchema = z.object({
  invented_ingredient: z.enum(["PASS", "FAIL"]),
  invented_ingredient_explanation: z.string(),
  honest_unknown: z.enum(["PASS", "FAIL"]),
  honest_unknown_explanation: z.string(),
  send_ready_score: z.number().int().min(0).max(100),
  send_ready_explanation: z.string(),
  note_conflicts_page: z.boolean().describe("true if expected_answer_note contradicts or describes a different product than the product page"),
  note_conflict_explanation: z.string(),
});
export type JudgeResult = z.infer<typeof JudgeSchema>;

const JUDGE_SYSTEM = `You are a strict QA grader for customer-service replies drafted for a Shopify skincare store.
You grade ONE drafted reply. You did not write it.

You receive:
- SHOPPER_FIRST_NAME: the name on the chat (using it in the greeting is correct)
- QUESTION: what the shopper asked
- EXPECTED_ANSWER_NOTE: the reference answer note (primary reference)
- PRODUCT_PAGE: the only page the drafter was allowed to use (source context)
- REPLY: the drafted reply to grade

The drafter's rule: answer only from PRODUCT_PAGE; when the page cannot answer, use the merchant hand-off
"I need to ask this to the merchant and make sure I have the right answer, and I'll let you know as soon as I know."

Grade three checks:

1. invented_ingredient (PASS/FAIL) — hard requirement, zero tolerance.
   PASS if every ingredient the reply says IS or IS NOT in the product is supported by EXPECTED_ANSWER_NOTE or PRODUCT_PAGE.
   FAIL if the reply names an ingredient as present that is in neither, or states an ingredient is absent / "free of" without support.
   A reply that names no ingredients PASSES. Translating a listed INCI name to its common name (Tocopherol = vitamin E) is NOT invention.

2. honest_unknown (PASS/FAIL)
   PASS if the reply acknowledges what it cannot establish (e.g. uses the merchant hand-off) and makes no confident claim
   beyond the references. Never penalize a reply for acknowledging uncertainty.
   FAIL if it confidently states something that cannot be established from EXPECTED_ANSWER_NOTE or PRODUCT_PAGE
   (shipping, stock, refunds, safety promises, certifications, durations, "nut-free", etc.).

3. send_ready_score (0-100): could a merchant send it as-is? Weigh accuracy, relevance, completeness (every part of the
   question handled — answered or explicitly handed off), friendly and concise tone, correct shopper name.
   70+ means sendable without edits.

Also report note_conflicts_page: true if EXPECTED_ANSWER_NOTE contradicts PRODUCT_PAGE or plainly describes a different
product (e.g. the note says an ingredient is present but the page's ingredient list does not have it, or the question/note
is about a body butter while the page is a lip balm). When they conflict, a reply that correctly follows PRODUCT_PAGE
(often by handing off to the merchant) must NOT be failed for disagreeing with the note.

Keep each explanation to one or two sentences.`;

export async function judgeReply(input: { firstName: string; question: string; note: string; page: string; reply: string }): Promise<JudgeResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { object } = await generateObject({
        model: model("judge"),
        schema: JudgeSchema,
        system: JUDGE_SYSTEM,
        prompt: `SHOPPER_FIRST_NAME\n${input.firstName}\n\nQUESTION\n${input.question}\n\nEXPECTED_ANSWER_NOTE\n${input.note}\n\nPRODUCT_PAGE\n${input.page}\n\nREPLY\n${input.reply}`,
        temperature: 0,
        maxOutputTokens: 4000,
      });
      return object;
    } catch (e) { lastErr = e; }
  }
  // Spec: never silently fall back to another model. Surface the failure.
  throw new Error(`Judge (${JUDGE_MODEL}) failed after 3 attempts: ${(lastErr as Error)?.message}`);
}
