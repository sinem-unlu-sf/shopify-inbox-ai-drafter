import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { getProduct, renderProductPage } from "./catalog";
import { FALLBACK, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

const DraftSchema = z.object({
  reply: z.string().describe("The message to send the shopper."),
  status: z
    .enum(["answered", "partial", "escalated"])
    .describe("answered = fully from the page; partial = some parts need the merchant; escalated = nothing answerable"),
  page_evidence: z.array(z.string()).describe("Exact quotes from the page that support the reply. Empty if escalated."),
});
export type Draft = z.infer<typeof DraftSchema>;

export async function draftReply(input: { productId: string; question: string; firstName?: string }): Promise<Draft> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing. Put it in .env.local.");

  const product = getProduct(input.productId);
  if (!product) return { reply: FALLBACK, status: "escalated", page_evidence: [] };

  const openrouter = createOpenRouter({ apiKey });
  const { object } = await generateObject({
    model: openrouter(MODEL),
    schema: DraftSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(renderProductPage(product), input.question, input.firstName),
    temperature: 0,
    maxOutputTokens: 600,
  });

  // Guardrail: every quoted piece of evidence must actually appear on the page.
  const page = renderProductPage(product).toLowerCase();
  const fabricated = object.page_evidence.filter((q) => !page.includes(q.toLowerCase().trim()));
  if (fabricated.length && object.status === "answered") {
    return { reply: FALLBACK, status: "escalated", page_evidence: [] };
  }
  // Guardrail: block absence/safety claims the page itself doesn't make.
  const risky = object.reply.match(
    /\b(there(?: is|'s) no|does(?:n't| not) (?:contain|have)|none of (?:the|its)|free (?:of|from)|[a-z]+-free|no allergens?|(?:is|it's) safe)\b/gi,
  ) ?? [];
  const unsupported = risky.filter((phrase) => !page.includes(phrase.toLowerCase()));
  if (unsupported.length) {
    return { reply: FALLBACK, status: "escalated", page_evidence: [], blocked: unsupported } as Draft;
  }
  return object;
}
