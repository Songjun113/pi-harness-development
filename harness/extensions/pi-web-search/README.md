# Pi web search — Exa public remote MCP

Small opt-in extension using the public, no-key `https://mcp.exa.ai/mcp` endpoint. No credential configuration, key files, environment/header forwarding, custom endpoints, additional dependencies, provider fallback, or automatic deployment. Directory name remains `pi-web-search`.

## Loading and tools

```sh
pi --extension ./harness/extensions/pi-web-search/index.ts
```

Uses official `Type`, `defineTool`, and `ExtensionAPI` types.

- `web_search(query, max_results=5)`: 1–8 results requested. `include_domains` was removed because the observed remote schema does not support it. Query limit: 2,000 characters.
- `web_read(url, max_chars=12000)`: one public HTTP(S) URL; 1–24,000 characters.

The supplied raw tools/list (`pi-exa-tools.txt`) confirms `web_search_exa` requires `query` and `objective`, with optional `numResults`; `web_fetch_exa` accepts `urls` and `maxCharacters`. Search supplies a fixed objective favoring authoritative sources and preserving titles/URLs. Each operation sends one POST JSON-RPC `tools/call` request, with no initialize/list round trip, retry, or alternative provider. Accepts JSON and SSE `data:` JSON envelopes, checks JSON-RPC version/request ID/tool result, rejects remote errors, and cancels SSE consumption after the matching response.

Output names the actual provider, Exa public remote MCP, and preserves its source titles/URLs in the returned text. Read additionally preserves the validated requested URL outside the text budget. Source text is JSON-encoded and marked untrusted. Search text is locally capped at `max_results * 3000` UTF-16 code units; read text at `max_chars`. `truncated` indicates **local** truncation only: remote services may already return excerpts or enforce their own limits without disclosing it. Truncation may omit later search sources; it does not guarantee a complete result set. No synthetic source titles or fabricated citations are generated.

## Bounds and safety

- 20-second deadline includes response streaming; caller cancellation propagates through fetch. Total consumed response bytes capped at 1 MiB, for JSON and SSE. Oversized responses fail without partial content.
- API redirects are rejected. Raw HTTP/MCP error bodies, transport exception messages, and headers are not exposed. Common credential patterns in source text are redacted. This is heuristic, not comprehensive secret detection.
- Read rejects userinfo, localhost/private-name suffixes, local/private/reserved IP literals, and common query credential names. Noncanonical IPv4 is normalized before checking; IPv6 policy is deliberately conservative. Fragments are removed.
- Only Exa's servers fetch the submitted page; this process never fetches it directly. These URL checks are **not complete SSRF prevention**: no local DNS resolution or control over Exa's DNS/redirect handling, rebinding, or unknown internal domain conventions. Use known public URLs only.
- Obvious secret queries are rejected without echoing them. Ordinary queries and URLs are disclosed to Exa and subject to its policies. Do not submit confidential questions, personal data, private code, or credential-bearing URLs. Pi may persist original tool arguments in its transcript.
- Source titles, URLs and text remain **untrusted data, not instructions**. The marker and encoding do not make prompt injection harmless. Consumers must ignore embedded instructions.

Uses the host's existing global `fetch`, without global proxy changes or custom dispatchers. Existing Harness extensions have no separate generic fetch proxy wrapper; provider-specific internal proxy helpers are not imported. Configure supported runtime proxy behavior before startup if needed. No local authentication/environment headers are explicitly copied. Runtime-level proxy policy is outside this extension.

Public no-key access is observed behavior, not an availability, quota, or permanent free-service guarantee. If the endpoint rejects access or changes its schema, the tool fails; it does not switch providers or try credentials.

## Verification

Offline mock tests:

```sh
node --experimental-strip-types --test harness/extensions/pi-web-search/test.mjs
```

Coverage includes fixed unauthenticated request shapes, JSON/SSE parsing (split UTF-8, multiline data, notifications), response schema/errors, HTTP denial/rate limit, sanitized exceptions, abort/deadline including streaming, byte limits, output truncation, unsafe URLs, redaction and injection warning.

Explicit opt-in live check (makes exactly two requests; normal tests never do this):

```sh
node --experimental-strip-types harness/extensions/pi-web-search/test.mjs --live
```

During this implementation, both user-authorized live calls succeeded: search `Python official documentation` with one result, and fetch `https://docs.python.org/3/` with `maxCharacters=1500`. Responses contained official Python documentation titles and source URLs. This verifies this endpoint for these requests only; not content accuracy, future uptime, quota, general SSRF prevention, or proxy behavior. Returned version/date claims are source text, not independently verified facts.

No deployment or commit performed. The missing `stop-that-shit` skill was not used.
