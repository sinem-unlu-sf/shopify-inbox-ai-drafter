import { getHeldoutQuestions, getProducts } from "../lib/catalog";
import { checkPilotFlag } from "../lib/pilot-gate";
import Drafter from "./drafter";

// Re-check the flag on every request: the flag is the on/off switch for AI replies.
export const dynamic = "force-dynamic";

export default async function Page() {
  const gate = await checkPilotFlag();
  if (!gate.enabled) {
    return (
      <main>
        <h1>Merchant inbox</h1>
        <p><strong>AI reply drafts are off.</strong> The <code>inbox-ai-reply-drafter</code> flag is not on for this store ({gate.reason.replace(/_/g, " ")}), so no AI replies are shown.</p>
      </main>
    );
  }
  const products = getProducts().map((p) => ({ id: p.product_id, title: p.title }));
  const questions = getHeldoutQuestions().map((q) => ({
    id: q.question_id, productId: q.product_id, text: q.question_text, firstName: q.shopper_first_name,
  }));
  return (
    <main>
      <h1>Merchant inbox</h1>
      <p>AI drafts a reply using only the product page. Anything the page doesn&apos;t say gets a hand-off to the shop. Review each draft, then send it as is, edit it, or discard it.</p>
      <Drafter products={products} questions={questions} />
    </main>
  );
}
