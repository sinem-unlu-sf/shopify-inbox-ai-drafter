import { getProducts, getQuestions } from "@/lib/catalog";
import Drafter from "./drafter";

export default function Page() {
  const products = getProducts().map((p) => ({ id: p.product_id, title: p.title }));
  const questions = getQuestions().map((q) => ({
    id: q.question_id, productId: q.product_id, text: q.question_text, firstName: q.shopper_first_name,
  }));
  return (
    <main>
      <h1>Shopper Reply Drafter</h1>
      <p>Drafts a reply using only the product page. Anything the page doesn&apos;t say goes to the merchant.</p>
      <Drafter products={products} questions={questions} />
    </main>
  );
}
