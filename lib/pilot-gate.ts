import { FLAG_KEY, STORE_GROUP, posthog } from "./posthog";

// The only object the gate needs from PostHog. Tests inject fakes through it.
export type FlagClient = {
  getFeatureFlag(key: string, distinctId: string, options?: { groups?: Record<string, string> }): Promise<unknown>;
};

export type GateResult = { enabled: true } | { enabled: false; reason: "flag_disabled" | "posthog_unavailable" | "flag_evaluation_error" };

const STORE_ID = STORE_GROUP.store;
const TIMEOUT_MS = Number(process.env.POSTHOG_FLAG_TIMEOUT_MS || 5000);

/**
 * Server-side, fail-closed check of the pilot flag for the dev store.
 * Enabled ONLY when PostHog explicitly returns `true` for this store.
 * Off, missing, timeout, network failure or any error => disabled.
 */
export async function checkPilotFlag(client?: FlagClient | null): Promise<GateResult> {
  let c: FlagClient;
  try {
    c = client ?? posthog();
  } catch {
    return { enabled: false, reason: "posthog_unavailable" }; // no key / client can't be built
  }
  try {
    const value = await Promise.race([
      c.getFeatureFlag(FLAG_KEY, STORE_ID, { groups: { ...STORE_GROUP } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    if (value === true) return { enabled: true };
    // posthog-node returns undefined when it cannot reach PostHog or the flag doesn't exist.
    if (value === undefined) return { enabled: false, reason: "posthog_unavailable" };
    return { enabled: false, reason: "flag_disabled" };
  } catch (e) {
    return { enabled: false, reason: (e as Error)?.message === "timeout" ? "posthog_unavailable" : "flag_evaluation_error" };
  }
}

export class PilotDisabledError extends Error {
  constructor(public reason: string) { super(`Reply drafter pilot is disabled (${reason}).`); }
}
