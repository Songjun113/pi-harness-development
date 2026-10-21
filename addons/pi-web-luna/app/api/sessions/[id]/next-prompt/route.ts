import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type AgentSession } from "@earendil-works/pi-coding-agent";
import { getRpcSession } from "@/lib/rpc-manager";
import { isApiRequestAllowed } from "@/lib/request-security";
import { cleanSuggestion, suggestionTranscript, SUGGESTION_MODEL, SUGGESTION_SYSTEM } from "@/lib/next-prompt-core";

type Result = { suggestion: string; model: string; status: string };
const modelName = `${SUGGESTION_MODEL.provider}/${SUGGESTION_MODEL.id}`;
const empty = (status: string): Result => ({ suggestion: "", model: modelName, status });
// Shared between tabs/HMR: no duplicate model call for one session branch revision.
type Cached = { task: Promise<Result>; expires: number };
const globalCache = globalThis as typeof globalThis & { __lunaNextPromptV2?: Map<string, Cached> };
const cache = globalCache.__lunaNextPromptV2 ??= new Map<string, Cached>();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiRequestAllowed(req)) return NextResponse.json(empty("forbidden"), { status: 403 });
  const { id } = await params;
  const wrapper = getRpcSession(id);
  // Never start a dormant agent just to predict text.
  if (!wrapper?.isAlive() || wrapper.isRunning()) return NextResponse.json(empty("inactive-or-busy"));
  const session = wrapper.inner as unknown as AgentSession;
  if (!session.isIdle || session.pendingMessageCount > 0) return NextResponse.json(empty("busy"));
  let config: { autoTrigger?: boolean; model?: { provider?: string; model?: string } };
  try { config = JSON.parse(await readFile(join(getAgentDir(), "next-prompt.json"), "utf8")); }
  catch { return NextResponse.json(empty("config-unavailable")); }
  // No silent fallback to the expensive primary model or a repository-selected destination.
  if (!config || config.autoTrigger === false) return NextResponse.json(empty("disabled"));
  if (config.model?.provider !== SUGGESTION_MODEL.provider || config.model?.model !== SUGGESTION_MODEL.id) return NextResponse.json(empty("model-config-mismatch"));
  const leaf = session.sessionManager.getLeafId();
  const messages = session.messages;
  const last = messages.filter(m => m.role === "user" || m.role === "assistant").at(-1);
  if (last?.role !== "assistant" || last.stopReason !== "stop") return NextResponse.json(empty("no-completed-reply"));
  const key = `${id}:${leaf}`;
  const cached = cache.get(key);
  let task = cached && cached.expires > Date.now() ? cached.task : undefined;
  if (!task) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    task = (async (): Promise<Result> => {
      try {
        const model = session.modelRuntime.getModel(SUGGESTION_MODEL.provider, SUGGESTION_MODEL.id);
        if (!model) return empty("model-unavailable");
        const transcript = suggestionTranscript(messages);
        if (!transcript) return empty("empty");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        // Shared request: one tab disconnecting must not cancel another tab's result.
        const unsubscribe = session.subscribe(event => {
          if (event.type === "agent_start") controller.abort();
        });
        try {
          const result = await session.modelRuntime.streamSimple(model, {
            systemPrompt: SUGGESTION_SYSTEM,
            messages: [{ role: "user", content: transcript, timestamp: Date.now() }],
          }, { reasoning: "low", maxTokens: 400, signal: controller.signal }).result();
          if (controller.signal.aborted || result.stopReason === "error" || result.stopReason === "aborted") return empty("request-failed");
          if (!wrapper.isAlive() || !session.isIdle || session.sessionManager.getLeafId() !== leaf) return empty("stale");
          return { suggestion: cleanSuggestion(result.content.filter(b => b.type === "text").map(b => b.text).join("")), model: modelName, status: "ready" };
        } finally { clearTimeout(timer); unsubscribe(); }
      } catch { return empty("request-failed"); }
    })();
    cache.set(key, { task, expires: Date.now() + 5 * 60_000 });
  }
  const result = await task;
  if (!wrapper.isAlive() || !session.isIdle || session.sessionManager.getLeafId() !== leaf) return NextResponse.json(empty("stale"));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
