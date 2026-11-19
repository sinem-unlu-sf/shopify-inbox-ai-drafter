# zero-shopify — Shopper Reply Drafter

Drafts replies to Shopify Inbox shopper questions using **only** the product page the shopper is asking about.
If the page doesn't answer it, the reply hands off to the merchant:

> I need to ask this to the merchant and make sure I have the right answer, and I'll let you know as soon as I know.

Built with Next.js, the Vercel AI SDK, and OpenRouter.

## Setup
1. `npm install`
2. Put your key in `.env.local` (gitignored, never committed):
   ```
   OPENROUTER_API_KEY=sk-or-...
   # optional: OPENROUTER_MODEL=baidu/ernie-5.5-flash-preview:free
   ```
3. `npm run dev` → http://localhost:3000. Pick a sample question or type your own.

Run every sample question: `npm run eval` writes `out/drafts.csv`. Run a few: `npm run eval -- Q-001 Q-006`.

## Reply rules (see `lib/prompt.ts`)
| Situation | Reply |
|---|---|
| Ingredient listed under its INCI name (e.g. Prunus Amygdalus Dulcis Oil) | Yes, and name it as sweet almond oil |
| Ingredient **not** listed | Never "no" or "free of". Says it isn't on the list, then hands off to the merchant |
| Facility warning ("handles tree nuts and peanuts") | Quotes the warning and never calls the product nut-free |
| Blank allergen statement | Makes no allergen claim, and the merchant answers the safety question |
| Parfum / fragrance components (linalool, essential oils) | Can't confirm, so it goes to the merchant |
| Shipping, stock, returns, certifications, pregnancy/baby safety | Goes to the merchant |
| Question is about a different product than the page | Goes to the merchant |

Code guardrails in `lib/drafter.ts` also turn a reply into the fallback if it quotes evidence that isn't on the page,
or makes a "free of" / "doesn't contain" / "is safe" claim the page doesn't make.

## Data note
Many sample questions name a different product than their `product_id` page (Q-002 asks about a body butter
from the Rose Lip Balm page). Many `expected_answer_note` values also don't match the catalog (Q-001 says DSP-003 contains almond,
but it doesn't). The drafter trusts the page, not the note.
