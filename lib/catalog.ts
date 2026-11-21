import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv";

export type Product = Record<string, string> & { product_id: string; title: string };
export type Question = Record<string, string> & { question_id: string; product_id: string; question_text: string };

const load = (file: string) => parseCsv(readFileSync(path.join(process.cwd(), "data", file), "utf8"));

let products: Product[] | null = null;
let questions: Question[] | null = null;

export const getProducts = () => (products ??= load("products.csv") as Product[]);
export const getQuestions = () => (questions ??= load("questions.csv") as Question[]);
// Held-out shopper questions for the live inbox check. The live page offers only these.
let heldout: Question[] | null = null;
export const getHeldoutQuestions = () => (heldout ??= load("heldout_questions.csv") as Question[]);
export const getProduct = (id: string) => getProducts().find((p) => p.product_id === id);

// The fields the drafter is allowed to see. Blank fields are shown as
// "(blank — the page makes no statement)" so the model can't mistake silence for a claim.
const PAGE_FIELDS = [
  "title", "product_type", "price", "size", "description",
  "ingredient_list", "allergen_statement", "usage_instructions",
] as const;

export function renderProductPage(p: Product): string {
  return PAGE_FIELDS.map((f) => {
    const v = (p[f] ?? "").trim();
    const shown = v === "" ? "(blank — the page makes no statement)" : f === "price" ? `${v} USD` : v;
    return `${f}: ${shown}`;
  }).join("\n");
}
