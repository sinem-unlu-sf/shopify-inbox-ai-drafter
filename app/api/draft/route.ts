import { draftReply } from "@/lib/drafter";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { productId, question, firstName } = await req.json();
  if (!productId || !question) return Response.json({ error: "productId and question are required" }, { status: 400 });
  try {
    return Response.json(await draftReply({ productId, question, firstName }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
