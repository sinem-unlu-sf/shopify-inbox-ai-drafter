import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Provider: "aiand" (https://api.aiand.com, default) or "openrouter".
export const PROVIDER = (process.env.LLM_PROVIDER || "aiand").toLowerCase();

const DEFAULTS = {
  aiand: { drafter: "moonshotai/kimi-k3.1-pro", judge: "deepseek-ai/deepseek-v4-pro" },
  openrouter: { drafter: "baidu/ernie-5.5-flash-preview:free", judge: "" },
} as const;

export const DRAFTER_MODEL =
  process.env.DRAFTER_MODEL || DEFAULTS[PROVIDER as keyof typeof DEFAULTS]?.drafter || "";
export const JUDGE_MODEL =
  process.env.JUDGE_MODEL || DEFAULTS[PROVIDER as keyof typeof DEFAULTS]?.judge || "";

function need(name: string) {
  const v = process.env[name];
  if (!v || v.startsWith("paste-")) throw new Error(`${name} is missing. Put it in .env.local.`);
  return v;
}

export function model(role: "drafter" | "judge") {
  const id = role === "drafter" ? DRAFTER_MODEL : JUDGE_MODEL;
  if (!id) throw new Error(`No ${role} model set. Set ${role.toUpperCase()}_MODEL in .env.local.`);
  if (PROVIDER === "openrouter") {
    const apiKey = need(role === "drafter" ? "OPENROUTER_API_KEY" : "OPENROUTER_JUDGE_KEY");
    return createOpenRouter({ apiKey })(id);
  }
  const apiKey = need(role === "drafter" ? "AIAND_API_KEY" : "AIAND_JUDGE_KEY");
  return createOpenAICompatible({ name: "aiand", baseURL: "https://api.aiand.com/v1", apiKey, supportsStructuredOutputs: true })(id);
}
