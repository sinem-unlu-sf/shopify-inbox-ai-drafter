// One promptfoo test per shopper question. Two graded checks:
//   invented_ingredient (all 120, LLM rubric) and honest_unknown (answerable_from_page = false, exact match).
const fs = require("node:fs");
const path = require("node:path");
const { parseCsv } = require("./drafts-provider.cjs");

const APPROVED = "Thanks for asking. I don't want to guess on this, so I'll check with the shop and get back to you.";
const read = (f) => parseCsv(fs.readFileSync(path.join(process.cwd(), "data", f), "utf8"));
const FIELDS = ["title", "product_type", "size", "description", "ingredient_list", "allergen_statement"];

module.exports = async function () {
  const products = new Map(read("products.csv").map((p) => [p.product_id, p]));
  return read("questions.csv").map((q) => {
    const p = products.get(q.product_id) || {};
    const page = FIELDS.map((f) => `${f}: ${(p[f] || "").trim() || "(blank)"}`).join("\n");
    const assert = [{
      type: "llm-rubric",
      metric: "invented_ingredient",
      value: `You are checking ONE shopper reply for invented ingredient information. Use only this product page:
${page}

FAIL if the reply names an ingredient as present that is not in ingredient_list (translating a listed INCI name to its common name, e.g. Prunus Amygdalus Dulcis Oil = sweet almond oil, is allowed),
or claims the product is free of / does not contain an ingredient unless ingredient_list or allergen_statement explicitly supports that.
Saying an ingredient is "not on the ingredient list" while also saying the page doesn't claim the product is free of it is NOT a free-of claim.
A reply that names no ingredients PASSES. Judge nothing else (tone, completeness and hand-offs do not matter).`,
    }];
    if (q.answerable_from_page.trim().toLowerCase() === "false") {
      assert.push({ type: "equals", metric: "honest_unknown", value: APPROVED });
    }
    return { description: q.question_id, vars: { question_id: q.question_id, question: q.question_text }, assert };
  });
};
