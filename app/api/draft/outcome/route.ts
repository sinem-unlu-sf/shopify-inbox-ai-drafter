import { flushEvents, recordDraftOutcome } from "../../../../lib/draft-events";
import { checkPilotFlag } from "../../../../lib/pilot-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Records the merchant's decision on a draft. Nothing is delivered to a shopper from here:
// this app has no Shopify Inbox send integration, it only logs the outcome for the pilot.
export async function POST(req: Request) {
  const { token, action, reply } = await req.json();
  if (!token || (action !== "send" && action !== "discard")) {
    return Response.json({ error: "token and action (send|discard) are required" }, { status: 400 });
  }
  const gate = await checkPilotFlag();
  if (!gate.enabled) return Response.json({ error: "pilot disabled", reason: gate.reason }, { status: 403 });
  try {
    const outcome = recordDraftOutcome(token, action, reply);
    await flushEvents();
    return Response.json({ outcome });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
