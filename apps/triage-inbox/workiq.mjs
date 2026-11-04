import { readFile } from "node:fs/promises";

export const WORKIQ_SERVER_NAME = "workiq";
export const WORKIQ_REQUIRED_TOOLS = Object.freeze(["fetch", "update_entity", "do_action"]);
export const WORKIQ_MCP_RESOURCE = "https://workiq.svc.cloud.microsoft/mcp";
export const WORKIQ_MCP_PROTOCOL_VERSION = "2025-06-18";
export const WORKIQ_SCOPE = "fdcc1f02-fc51-4226-8753-f668596af7f7/WorkIQAgent.Ask";
export const WORKIQ_CLIENT_ID = "ba081686-5d24-4bc6-a0d6-d034ecffed87";

const WORKIQ_TIMEOUT_MS = 60_000;
const WORKIQ_SEMANTIC_TIMEOUT_MS = 300_000;
const WORKIQ_DISCOVERY_TIMEOUT_MS = 30_000;
const WORKIQ_RETRYABLE_TOOLS = new Set([
  "fetch",
  "fetch_blob",
  "call_function",
  "get_schema",
  "search_paths",
  "list_agents",
]);
const WORKIQ_RETRY_BASE_DELAY_MS = 500;
const WORKIQ_MAX_ATTEMPTS = 3;

const HOST_UNAVAILABLE = /MCP host is not available on this session/i;
const BRIDGE_FALLBACK_ERROR =
  /capability is not available in this session|MCP host is not available|not connected|WorkIQ plugin is not ready|Authentication requires user interaction|Sign in again|OAuth token expired/i;
const RATE_LIMITED_ERROR = /\bHTTP (?:429|502|503|504)\b|TooManyRequests|throttl|rate[- ]?limit|temporarily unavailable/i;

export class WorkIqError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function errorText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const rawErr = typeof value.error === "object" && value.error !== null ? value.error : null;
  const errObj = typeof rawErr?.error === "object" && rawErr.error !== null ? rawErr.error : rawErr;
  const status = value.statusCode ?? value.status ?? errObj?.statusCode ?? errObj?.status;
  const code = errObj?.code ?? value.code;
  const retryAfter = Number(value.retryAfterSeconds ?? rawErr?.retryAfterSeconds ?? errObj?.retryAfterSeconds ?? 0);
  const msg =
    errObj?.message ??
    (typeof value.error === "string" ? value.error : "") ??
    value.message ??
    value.error_description ??
    value.statusDescription ??
    "";
  const target = value.entityUrl ?? value.actionUrl ?? value.parentUrl ?? value.path ?? "";
  const parts = [];
  if (status) parts.push(`HTTP ${status}`);
  if (code && code !== String(status)) parts.push(`[${code}]`);
  if (msg) parts.push(msg);
  if (retryAfter > 0) parts.push(`(retry after ${retryAfter}s)`);
  if (target) parts.push(`(${target})`);
  if (parts.length) return parts.join(" ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractIsErrorDetail(result) {
  const textParts = (result.content ?? [])
    .map((part) => {
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
      if (part && typeof part === "object" && part.type !== "text") {
        try {
          return JSON.stringify(part);
        } catch {
          return "";
        }
      }
      return "";
    })
    .filter(Boolean);
  if (textParts.length) return textParts.join("\n");

  const structured = result.structuredContent;
  if (structured !== undefined && structured !== null) {
    let parsed = structured;
    if (typeof structured === "string") {
      try {
        parsed = JSON.parse(structured);
      } catch {
        return structured.trim();
      }
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.results)) {
        const failed = parsed.results.filter(
          (entry) => entry?.error || Number(entry?.statusCode ?? 200) < 200 || Number(entry?.statusCode ?? 200) >= 300,
        );
        if (failed.length) return failed.map(errorText).filter(Boolean).join("; ");
      }
      const detail = errorText(parsed);
      if (detail && detail !== "{}") return detail;
    }
  }

  if (result.error || result.message || result.code) {
    const detail = errorText(result);
    if (detail && detail !== "{}") return detail;
  }
  return "";
}

function describeCall(name, args) {
  if (!args || typeof args !== "object") return name;
  const target =
    args.entityUrl ??
    args.actionUrl ??
    args.parentUrl ??
    (Array.isArray(args.entityUrls) && args.entityUrls.length
      ? args.entityUrls.length === 1
        ? args.entityUrls[0]
        : `${args.entityUrls[0]} (+${args.entityUrls.length - 1} more)`
      : "");
  return target ? `${name} (${String(target).slice(0, 140)})` : name;
}

function markRateLimit(error, payload = null) {
  if (RATE_LIMITED_ERROR.test(String(error?.message ?? ""))) {
    error.rateLimited = true;
    const resultRetryAfterSeconds = Array.isArray(payload?.results)
      ? payload.results.find((entry) => Number(entry?.retryAfterSeconds) > 0)?.retryAfterSeconds
      : undefined;
    const retrySec = Number(
      payload?.retryAfterSeconds ??
      resultRetryAfterSeconds ??
      payload?.error?.retryAfterSeconds ??
      payload?.headers?.["retry-after"] ??
      0,
    );
    if (Number.isFinite(retrySec) && retrySec > 0) {
      error.retryAfterSeconds = retrySec;
      error.retryAfterMs = retrySec * 1000;
    }
  }
  return error;
}

function isPermanentToolError(detail) {
  if (/\b(408|429)\b/.test(detail)) return false;
  return /access denied|forbidden|unauthorized|not found|does not exist|invalid|malformed|bad request|unsupported|\b4\d\d\b/i
    .test(detail);
}

function markTransientToolError(error, detail) {
  error.retryable = Boolean(detail) && !isPermanentToolError(detail);
  return error;
}

export function unwrapWorkIqResult(result, label, { validateResults = true } = {}) {
  if (!result || typeof result !== "object") {
    throw new WorkIqError("workiq_empty", `${label}: WorkIQ returned no result`);
  }
  if (result.isError) {
    const detail = extractIsErrorDetail(result);
    const rejected = markTransientToolError(markRateLimit(
      new WorkIqError("workiq_error", `${label}: ${detail || "WorkIQ rejected the tool call (empty MCP error response)"}`),
      result.structuredContent,
    ), detail);
    if (!detail) rejected.emptyErrorResponse = true;
    throw rejected;
  }

  const structured = result.structuredContent;
  if (structured !== undefined && structured !== null) {
    if (typeof structured === "string") {
      let parsed;
      try {
        parsed = JSON.parse(structured);
      } catch {
        throw new WorkIqError("workiq_invalid_result", `${label}: WorkIQ returned invalid JSON`);
      }
      return validateResults ? validatePayload(parsed, label) : parsed;
    }
    return validateResults ? validatePayload(structured, label) : structured;
  }

  const textParts = (result.content ?? []).map((part) => part.text ?? "").filter(Boolean);
  for (const part of textParts) {
    try {
      const payload = JSON.parse(part);
      return validateResults ? validatePayload(payload, label) : payload;
    } catch (error) {
      if (error instanceof WorkIqError) throw error;
    }
  }

  const text = textParts.join("\n");
  return text ? { text } : {};
}

function validatePayload(payload, label) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.error || payload.statusCode >= 400) {
    const rejected = markRateLimit(new WorkIqError("workiq_error", `${label}: ${errorText(payload)}`), payload);
    rejected.retryable = Number(payload.statusCode) >= 500 || /408|429/.test(errorText(payload));
    throw rejected;
  }
  if (Array.isArray(payload.results)) {
    for (const [index, result] of payload.results.entries()) {
      const statusCode = Number(result?.statusCode ?? 200);
      if (result?.error || statusCode < 200 || statusCode >= 300) {
        const rejected = markRateLimit(
          new WorkIqError(
            "workiq_error",
            `${label} result ${index + 1}: ${errorText(result)}`,
          ),
          result,
        );
        rejected.retryable = statusCode >= 500 || statusCode === 408 || statusCode === 429;
        throw rejected;
      }
    }
  }
  return payload;
}

export function extractWorkIqEntityOutcomes(payload) {
  if (!payload || typeof payload !== "object") return [];
  const candidates = Array.isArray(payload.results)
    ? payload.results
    : "data" in payload
      ? [payload]
      : [];
  return candidates.map((candidate) => {
    const item = candidate && typeof candidate === "object" ? candidate : {};
    const rawErr = typeof item.error === "object" && item.error !== null ? item.error : null;
    const graphErr = typeof rawErr?.error === "object" && rawErr.error !== null ? rawErr.error : rawErr;
    return {
      statusCode: Number(item.statusCode ?? 200),
      data: item.data && typeof item.data === "object" ? item.data : null,
      error: graphErr?.message ?? graphErr?.detail ?? graphErr?.description ?? graphErr?.code ?? null,
      retryAfterSeconds: Number(item.retryAfterSeconds ?? rawErr?.retryAfterSeconds ?? graphErr?.retryAfterSeconds ?? 0),
    };
  });
}

function parseSseFrame(raw, requestId) {
  const frames = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^data:\s?(.*)$/);
    if (!match?.[1]?.trim()) continue;
    try {
      frames.push(JSON.parse(match[1]));
    } catch {
      // Ignore keep-alives and non-JSON frames.
    }
  }
  const frame = frames.find((entry) => requestId !== undefined && entry.id === requestId) ?? frames.at(-1);
  if (!frame) {
    throw new Error(`Work IQ MCP SSE response contained no data events for request ${requestId ?? "notification"}`);
  }
  return frame;
}

function directToolResult(result) {
  if (!result || typeof result !== "object") return {};
  return result;
}

/**
 * Official streamable-HTTP Work IQ MCP transport. Authentication stays
 * injected so the transport can use Copilot-hosted or MSAL-backed tokens.
 */
export function createWorkIqDirectClient({
  getAccessToken,
  endpoint = WORKIQ_MCP_RESOURCE,
  fetchImpl = globalThis.fetch,
  timeoutMs = WORKIQ_TIMEOUT_MS,
  semanticTimeoutMs = WORKIQ_SEMANTIC_TIMEOUT_MS,
  discoveryTimeoutMs = WORKIQ_DISCOVERY_TIMEOUT_MS,
  clientName = "copilot-canvas-triage-inbox",
  clientVersion = "1.0.0",
} = {}) {
  if (typeof getAccessToken !== "function") {
    throw new WorkIqError("workiq_auth_missing", "A Work IQ access-token provider is required");
  }
  if (typeof fetchImpl !== "function") {
    throw new WorkIqError("workiq_http_unavailable", "The Work IQ direct client requires fetch");
  }

  let nextId = 1;
  let initialized = false;
  let initializeInflight = null;
  let sessionId = null;

  function resetSession() {
    initialized = false;
    initializeInflight = null;
    sessionId = null;
  }

  async function request(token, method, params, options, includeId = true) {
    const id = includeId ? nextId++ : undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    };
    if (method !== "initialize") {
      headers["MCP-Protocol-Version"] = WORKIQ_MCP_PROTOCOL_VERSION;
      if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    }
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(id !== undefined ? { id } : {}),
          method,
          params,
        }),
        signal: controller.signal,
      });
      const nextSessionId = response.headers.get("mcp-session-id");
      if (nextSessionId) sessionId = nextSessionId;
      if (response.status === 401 || response.status === 403) {
        const error = new WorkIqError(
          "workiq_auth_required",
          `Work IQ MCP rejected ${method} with HTTP ${response.status}`,
        );
        error.authRequired = true;
        throw error;
      }
      const raw = await response.text();
      if (!response.ok) {
        let responseDetail = raw.trim();
        try {
          responseDetail = errorText(JSON.parse(raw));
        } catch {
          // Preserve the service's plain-text response when it is not JSON.
        }
        const error = markRateLimit(
          new WorkIqError(
            "workiq_http_error",
            `Work IQ MCP ${method} HTTP ${response.status}: ${responseDetail || response.statusText}`,
          ),
          {
            headers: { "retry-after": response.headers.get("retry-after") },
          },
        );
        if (error.retryAfterSeconds && !/\(retry after \d+s\)/i.test(error.message)) {
          error.message += ` (retry after ${error.retryAfterSeconds}s)`;
        }
        if (response.status >= 500) error.retryable = true;
        throw error;
      }
      if (!raw.trim()) {
        if (options.allowEmpty) return { result: undefined, response };
        throw new WorkIqError("workiq_empty", `Work IQ MCP ${method} returned an empty response`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      const frame = contentType.includes("text/event-stream")
        ? parseSseFrame(raw, id)
        : JSON.parse(raw);
      if (frame.error) {
        const error = new WorkIqError(
          "workiq_rpc_error",
          `Work IQ MCP ${method} error ${frame.error.code}: ${frame.error.message}`,
        );
        if (frame.error.code === -32000 || /temporar|unavailable|timeout/i.test(frame.error.message ?? "")) {
          error.retryable = true;
        }
        throw error;
      }
      return { result: frame.result, response };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeout = new WorkIqError(
          "workiq_timeout",
          `Work IQ MCP ${method} timed out after ${options.timeoutMs}ms`,
        );
        timeout.retryable = true;
        throw timeout;
      }
      if (error instanceof WorkIqError) throw error;
      const wrapped = new WorkIqError("workiq_http_error", `Work IQ MCP fetch failed for ${endpoint}: ${error.message}`);
      wrapped.retryable = /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(error.message);
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureInitialized(token) {
    if (initialized) return;
    if (initializeInflight) return initializeInflight;
    initializeInflight = (async () => {
      await request(
        token,
        "initialize",
        {
          protocolVersion: WORKIQ_MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: clientName, version: clientVersion },
        },
        { timeoutMs: discoveryTimeoutMs },
      );
      await request(
        token,
        "notifications/initialized",
        {},
        { timeoutMs: discoveryTimeoutMs, allowEmpty: true },
        false,
      );
      initialized = true;
    })().finally(() => {
      initializeInflight = null;
    });
    return initializeInflight;
  }

  async function invoke(method, params, requestTimeoutMs) {
    let token = await getAccessToken("workiq");
    try {
      await ensureInitialized(token);
      return await request(token, method, params, { timeoutMs: requestTimeoutMs });
    } catch (error) {
      if (!error?.authRequired) throw error;
      resetSession();
      token = await getAccessToken("workiq", { forceRefresh: true });
      await ensureInitialized(token);
      return request(token, method, params, { timeoutMs: requestTimeoutMs });
    }
  }

  async function callTool(requestOptions) {
    const name = requestOptions?.toolName ?? requestOptions?.name;
    const args = requestOptions?.arguments ?? requestOptions?.args ?? {};
    const requestTimeoutMs = name === "ask" || name === "retrieve" ? semanticTimeoutMs : timeoutMs;
    const maxAttempts = WORKIQ_RETRYABLE_TOOLS.has(name) ? WORKIQ_MAX_ATTEMPTS : 1;
    let failure;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await invoke("tools/call", { name, arguments: args }, requestTimeoutMs);
        return directToolResult(response.result);
      } catch (error) {
        failure = markRateLimit(error);
        failure.directRetryHandled = true;
        const delayMs = failure.retryAfterMs ?? WORKIQ_RETRY_BASE_DELAY_MS * 2 ** attempt;
        const retryable = failure.retryable
          || failure.rateLimited
          || /timed out|empty response|HTTP 5\d\d|fetch failed|network/i.test(failure.message);
        if (attempt >= maxAttempts - 1 || !retryable || delayMs > 5000) throw failure;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw failure;
  }

  async function listTools() {
    const response = await invoke("tools/list", {}, discoveryTimeoutMs);
    return { tools: response.result?.tools ?? [] };
  }

  return {
    listTools,
    callTool,
    fetch: (entityUrls) => callTool({ toolName: "fetch", arguments: { entityUrls } }),
    destroy: resetSession,
  };
}

export function createWorkIqHostAdapter({
  listTools,
  callTool,
  login,
  getAccessToken,
  directEndpoint = WORKIQ_MCP_RESOURCE,
  fetchImpl = globalThis.fetch,
  bridgePath = null,
  serverName = WORKIQ_SERVER_NAME,
  retryDelayMs = 500,
  rateLimitDelayMs = 1500,
} = {}) {
  let discovery;
  let reconnectAttempted = false;
  let reconnectPromise = null;
  let useBridge = false;
  let cooldownUntil = 0;
  let bridgePublisher = null;
  const directClient = typeof getAccessToken === "function"
    ? createWorkIqDirectClient({ getAccessToken, endpoint: directEndpoint, fetchImpl })
    : null;
  const hostListTools = directClient?.listTools ?? listTools;
  const hostCallTool = directClient?.callTool ?? callTool;
  const publishVerifiedDirectCall = async (result, label) => {
    if (typeof bridgePublisher !== "function") return;
    try {
      unwrapWorkIqResult(result, label);
      await bridgePublisher();
    } catch {
      // Bridge publication is best-effort and must not reject an otherwise valid WorkIQ call.
    }
  };

  async function callBridge(method, params) {
    if (!bridgePath) throw new Error("No WorkIQ bridge configured");
    const raw = JSON.parse(await readFile(bridgePath, "utf8"));
    if (!raw?.url || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(String(raw.url)) || !raw?.token) {
      throw new Error("No active WorkIQ peer bridge available");
    }
    const response = await fetch(`${raw.url}api/workiq-bridge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Triage-Bridge": String(raw.token),
      },
      body: JSON.stringify({ method, params }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `WorkIQ bridge returned HTTP ${response.status}`);
    }
    return payload.result;
  }

  async function discoverOnce() {
    if (typeof hostListTools !== "function" || typeof hostCallTool !== "function") {
      throw new WorkIqError("workiq_unavailable", "The WorkIQ plugin is not available in this canvas session");
    }
    discovery ??= (async () => {
      let result;
      try {
        if (useBridge) {
          result = await callBridge("listTools", { serverName, originServerName: serverName });
        } else {
          result = directClient
            ? await hostListTools()
            : await hostListTools({ serverName, originServerName: serverName });
        }
      } catch (error) {
        if (bridgePath && !useBridge && BRIDGE_FALLBACK_ERROR.test(String(error?.message ?? error))) {
          try {
            result = await callBridge("listTools", { serverName, originServerName: serverName });
            useBridge = true;
          } catch {
            // Fall through to surface original discovery error if bridge is unreachable.
          }
        }
        if (!result) {
          throw new WorkIqError(
            "workiq_discovery_failed",
            `Cannot discover WorkIQ tools from the ${serverName} MCP server: ${error.message}`,
          );
        }
      }
      const tools = Array.isArray(result?.tools) ? result.tools : [];
      const names = new Set(tools.map((tool) => tool?.name).filter(Boolean));
      const missing = WORKIQ_REQUIRED_TOOLS.filter((name) => !names.has(name));
      if (missing.length) {
        throw new WorkIqError(
          "workiq_tool_missing",
          `The WorkIQ plugin does not expose required tool${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
        );
      }
      return names;
    })();
    return discovery;
  }

  async function reconnect() {
    if (reconnectPromise) return reconnectPromise;
    if (reconnectAttempted || typeof login !== "function") return false;
    reconnectAttempted = true;
    discovery = null;
    reconnectPromise = (async () => {
      try {
        await login({ serverName });
      } catch (error) {
        if (!HOST_UNAVAILABLE.test(String(error?.message ?? error))) {
          throw new WorkIqError(
            "workiq_auth_failed",
            `Cannot reconnect to the ${serverName} plugin: ${error.message}`,
          );
        }
        if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        discovery = null;
      }
      return true;
    })();
    try {
      return await reconnectPromise;
    } finally {
      reconnectPromise = null;
    }
  }

  async function discoverTools() {
    try {
      return await discoverOnce();
    } catch (error) {
      if (await reconnect()) return discoverOnce();
      throw error;
    }
  }

  function shouldReconnect(error, operation) {
    if (error?.emptyErrorResponse) return operation === "fetch";
    return /(auth|oauth|unauthori[sz]ed|forbidden|expired|401|403|connect|connection|network|unavailable)/i
      .test(String(error?.message ?? error));
  }

  async function call(name, args, options) {
    await discoverTools();
    const label = describeCall(name, args);
    const callArgs = {
      serverName,
      originServerName: serverName,
      toolName: name,
      arguments: args,
    };
    const invoke = async () => {
      if (useBridge) return callBridge("callTool", callArgs);
      try {
        return await hostCallTool(callArgs);
      } catch (error) {
        if (bridgePath && BRIDGE_FALLBACK_ERROR.test(String(error?.message ?? error))) {
          const bridged = await callBridge("callTool", callArgs);
          useBridge = true;
          return bridged;
        }
        throw error;
      }
    };
    for (let attempt = 0; ; attempt++) {
      const waitCooldown = cooldownUntil - Date.now();
      if (waitCooldown > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitCooldown));
      }
      let result;
      let failure;
      try {
        result = await invoke();
      } catch (error) {
        failure = markRateLimit(error);
      }
      if (!failure) {
        try {
          const value = unwrapWorkIqResult(result, label, options);
          if (!useBridge) await publishVerifiedDirectCall(result, label);
          reconnectAttempted = false;
          return value;
        } catch (error) {
          if (bridgePath && !useBridge && BRIDGE_FALLBACK_ERROR.test(String(error?.message ?? error))) {
            try {
              const bridged = await callBridge("callTool", callArgs);
              const value = unwrapWorkIqResult(bridged, label, options);
              useBridge = true;
              reconnectAttempted = false;
              return value;
            } catch {
              // Preserve the direct result so reconnect or the normal retry policy can recover.
            }
          }
          failure = error;
          const retryableRead =
            error?.retryable && WORKIQ_RETRYABLE_TOOLS.has(name);
          const reconnectable = shouldReconnect(error, name);
          if (!error?.emptyErrorResponse && !error?.rateLimited && !retryableRead && !reconnectable) throw error;
        }
      }
      const reconnectable = attempt === 0 && shouldReconnect(failure, name);
      if (reconnectable && await reconnect()) {
        await discoverTools();
        continue;
      }
      const inlineRetry =
        (failure?.rateLimited || (failure?.retryable && WORKIQ_RETRYABLE_TOOLS.has(name)))
        && !failure?.directRetryHandled
        && attempt < 2;
      if (inlineRetry) {
        const delay = failure.retryAfterMs
          ?? (failure.rateLimited ? rateLimitDelayMs : WORKIQ_RETRY_BASE_DELAY_MS * 2 ** attempt);
        if (delay > 0 && delay <= 5000) {
          cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      throw failure instanceof WorkIqError
        ? failure
        : new WorkIqError("workiq_call_failed", `${label}: ${failure.message}`);
    }
  }

  async function optionalTool(name, args) {
    const names = await discoverTools();
    if (!names.has(name)) {
      throw new WorkIqError("workiq_tool_missing", `The WorkIQ plugin does not expose optional tool: ${name}`);
    }
    return call(name, args, { validateResults: false });
  }

  return {
    setBridgePublisher: (publish) => {
      bridgePublisher = typeof publish === "function" ? publish : null;
    },
    call,
    rawListTools: directClient
      ? () => hostListTools()
      : typeof listTools === "function"
        ? (params) => hostListTools({ serverName, originServerName: serverName, ...params })
        : null,
    rawCallTool: typeof callTool === "function" || directClient
      ? async (params) => {
          const result = directClient
            ? await hostCallTool(params)
            : await hostCallTool({ serverName, originServerName: serverName, ...params });
          const label = describeCall(params?.toolName ?? "raw call", params?.arguments ?? {});
          unwrapWorkIqResult(result, label);
          await publishVerifiedDirectCall(result, label);
          return result;
        }
      : null,
    hasTool: async (toolName) => {
      try {
        return (await discoverTools()).has(toolName);
      } catch {
        return false;
      }
    },
    retrieve: (args) => optionalTool("retrieve", args),
    ask: (args) => optionalTool("ask", args),
    fetch: (entityUrls) => call("fetch", { entityUrls }),
    fetchPartial: (entityUrls) => call("fetch", { entityUrls }, { validateResults: false }),
    update: (entityUrl, jsonBody) => call("update_entity", { entityUrl, jsonBody }),
    action: (actionUrl, jsonBody = {}) => call("do_action", { actionUrl, jsonBody }),
    delete: async (entityUrl) => {
      try {
        return await call("do_action", { actionUrl: `${entityUrl}/move`, jsonBody: { DestinationId: "deleteditems" } });
      } catch (error) {
        const names = await discoverTools();
        if (!names.has("delete_entity")) throw error;
        return call("delete_entity", { entityUrl });
      }
    },
    create: async (parentUrl, jsonBody) => {
      const names = await discoverTools();
      if (!names.has("create_entity")) {
        throw new WorkIqError(
          "workiq_tool_missing",
          "The WorkIQ plugin does not expose required tool: create_entity",
        );
      }
      return call("create_entity", { parentUrl, jsonBody });
    },
  };
}
