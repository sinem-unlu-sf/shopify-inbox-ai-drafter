import { generateObject } from "ai";
import { DRAFTER_MODEL, model } from "./llm";
import { checkPilotFlag, PilotDisabledError, type FlagClient } from "./pilot-gate";
import { z } from "zod";
import { getProduct, renderProductPage } from "./catalog";
import { FALLBACK, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export const MODEL = DRAFTER_MODEL;

// Anything not fully answered from the page gets the approved sentence, exactly, with nothing added.
const fallback = (_firstName?: string): Draft => ({ reply: FALLBACK, status: "escalated", page_evidence: [] });

const DraftSchema = z.object({
  reply: z.string().describe("The message to send the shopper."),
  status: z
    .enum(["answered", "partial", "escalated"])
    .describe("answered = fully from the page; partial = some parts need the merchant; escalated = nothing answerable"),
  page_evidence: z.array(z.string()).describe("Exact quotes from the page that support the reply. Empty if escalated."),
});
export type Draft = z.infer<typeof DraftSchema>;

export async function draftReply(
  input: { productId: string; question: string; firstName?: string },
  opts: { flagClient?: FlagClient | null } = {},
): Promise<Draft> {
  // Server-side pilot gate: fail closed before any model call.
  const gate = await checkPilotFlag(opts.flagClient);
  if (!gate.enabled) throw new PilotDisabledError(gate.reason);


  const product = getProduct(input.productId);
  if (!product) return fallback(input.firstName);

  const llm = model("drafter");
  let object: Draft | undefined;
  for (let attempt = 1; attempt <= 3 && !object; attempt++) {
    try {
      ({ object } = await generateObject({
    model: llm,
    schema: DraftSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(renderProductPage(product), input.question, input.firstName),
    temperature: 0,
    maxOutputTokens: 2000,
      }));
    } catch (e) {
      if (attempt === 3) {
        // Unparseable model output: never guess, hand it to the merchant.
        console.warn(`draft failed after 3 attempts: ${(e as Error).message}`);
        return fallback(input.firstName);
      }
    }
  }
  if (!object) return fallback(input.firstName);
  // Partial or escalated drafts never go out as paraphrases: only a full page-backed answer keeps its own wording.
  if (object.status !== "answered" || object.reply.includes(FALLBACK)) return fallback(input.firstName);

  // Guardrail: every quoted piece of evidence must actually appear on the page.
  // Compare letters/digits only, so punctuation or spacing slips in a quote don't count as fabrication.
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const page = renderProductPage(product).toLowerCase();
  const fabricated = object.page_evidence.filter((q) => !norm(page).includes(norm(q)));
  if (fabricated.length && object.status === "answered") {
    console.warn(`[guardrail] evidence not on page: ${JSON.stringify(fabricated)} | reply was: ${object.reply}`);
    return fallback(input.firstName);
  }
  // Guardrail: block absence/safety claims the page itself doesn't make.
  // Checked per sentence: "it doesn't state whether it's cruelty-free" is honest; "it's cruelty-free" is a claim.
  const RISKY = /\b(there(?: is|'s) no|does(?:n't| not) (?:contain|have)|none of (?:the|its)|free (?:of|from)|[a-z]+-free|no allergens?|(?:is|it's) safe)\b/gi;
  const HEDGE = /\b(whether|doesn['’]t (?:say|state|mention|list|include)|does not (?:say|state|mention|list|include)|not (?:stated|listed|mentioned)|can['’]t (?:confirm|say)|cannot (?:confirm|say)|no (?:information|details|mention)|need to ask|not sure)\b/i;
  const unsupported = object.reply
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !HEDGE.test(sentence))
    .flatMap((sentence) => sentence.match(RISKY) ?? [])
    .filter((phrase) => !page.includes(phrase.toLowerCase()));
  if (unsupported.length) {
    console.warn(`[guardrail] unsupported claim ${JSON.stringify(unsupported)} | reply was: ${object.reply}`);
    return fallback(input.firstName);
  }
  return object;
}
