import { PostHog } from "posthog-node";

// The PostHog project key is read from .env.local (gitignored). It is never hardcoded or committed.
export const FLAG_KEY = "inbox-ai-reply-drafter";
export const STORE_GROUP = { store: "inbox-ai-dev-store" } as const;

let client: PostHog | null = null;

export function posthog(): PostHog {
  const key = process.env.POSTHOG_PROJECT_KEY;
  if (!key || key.startsWith("paste-")) throw new Error("POSTHOG_PROJECT_KEY is missing. Put it in .env.local.");
  return (client ??= new PostHog(key, { host: process.env.POSTHOG_HOST || "https://us.i.posthog.com", flushAt: 1, flushInterval: 0 }));
}
