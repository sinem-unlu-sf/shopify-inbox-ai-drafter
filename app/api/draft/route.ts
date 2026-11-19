import { draftReply } from "@/lib/drafter";
import { PilotDisabledError } from "@/lib/pilot-gate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { productId, question, firstName } = await req.json();
  if (!productId || !question) return Response.json({ error: "productId and question are required" }, { status: 400 });
  try {
    return Response.json(await draftReply({ productId, question, firstName }));
  } catch (e) {
    if (e instanceof PilotDisabledError) return Response.json({ error: e.message, reason: e.reason }, { status: 403 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
