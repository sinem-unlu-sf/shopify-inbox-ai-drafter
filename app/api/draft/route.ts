import { draftReply } from "../../../lib/drafter";
import { flushEvents, recordDraftCreated } from "../../../lib/draft-events";
import { PilotDisabledError } from "../../../lib/pilot-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { productId, question, firstName, questionId, trigger } = await req.json();
  if (!productId || !question) return Response.json({ error: "productId and question are required" }, { status: 400 });
  try {
    const draft = await draftReply({ productId, question, firstName }); // throws when the pilot flag is off
    const { draft_id, token } = recordDraftCreated({ reply: draft.reply, product_id: productId, question_id: questionId, draft_status: draft.status,
      trigger: trigger === "deep_link" ? "deep_link" : "manual" });
    await flushEvents();
    return Response.json({ ...draft, draft_id, token });
  } catch (e) {
    if (e instanceof PilotDisabledError) return Response.json({ error: e.message, reason: e.reason }, { status: 403 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
