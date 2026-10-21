"use client";
import { useEffect, useRef, useState } from "react";

export function useNextPrompt(sessionId: string | undefined, busy: boolean, empty: boolean) {
  const [result, setResult] = useState<{ key: string; text: string } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const key = `${sessionId}:${revision}`;
  useEffect(() => {
    if (busy) { setRevision(r => r + 1); setResult(null); }
  }, [busy]);
  useEffect(() => {
    const token = ++generation.current;
    if (!sessionId || busy || !empty || dismissed === key || !visible) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/next-prompt`, { method: "POST", signal: controller.signal });
        if (!response.ok) return;
        const data: { suggestion?: unknown } = await response.json();
        if (!controller.signal.aborted && generation.current === token && typeof data.suggestion === "string") {
          setResult({ key, text: data.suggestion });
        }
      } catch { /* Suggestions are optional and never block editing. */ }
    }, 800);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sessionId, busy, empty, key, dismissed, visible]);
  return {
    suggestion: visible && !busy && empty && dismissed !== key && result?.key === key ? result.text : "",
    dismiss: () => setDismissed(key),
  };
}
