const DEFAULT_ENDPOINT = "https://jx.wxss.dpdns.org/api/shortcut/resolve";
import { errorDetails, log, safeUrl } from "./logger.mjs";

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return { controller, clear: () => clearTimeout(timer) };
}

export async function resolveViaApi(targetUrl, config) {
  if (!config.apiKey) {
    const error = new Error("尚未配置解析服务 API Key");
    error.code = "API_KEY_MISSING";
    error.status = 400;
    throw error;
  }
  const endpoint = process.env.ZJJX_API_ENDPOINT || DEFAULT_ENDPOINT;
  log("INFO", "parser_request_start", { source: safeUrl(targetUrl), endpoint: safeUrl(endpoint), timeoutMs: Number(process.env.ZJJX_REQUEST_TIMEOUT_MS || 30000) });
  const timeout = withTimeout(Number(process.env.ZJJX_REQUEST_TIMEOUT_MS || 30000));
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: timeout.controller.signal,
      headers: { "content-type": "application/json", accept: "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify({ url: targetUrl, quality: "hd", format: "video" })
    });
  } catch (error) {
    log("ERROR", "parser_request_network_failed", { source: safeUrl(targetUrl), endpoint: safeUrl(endpoint), error: errorDetails(error) });
    const wrapped = new Error(error.name === "AbortError" ? "解析服务请求超时" : "无法连接解析服务");
    wrapped.code = error.name === "AbortError" ? "PARSER_TIMEOUT" : "PARSER_NETWORK";
    wrapped.status = 502;
    throw wrapped;
  } finally {
    timeout.clear();
  }
  const text = await response.text();
  log("INFO", "parser_response", { source: safeUrl(targetUrl), endpoint: safeUrl(endpoint), status: response.status, bodyBytes: Buffer.byteLength(text) });
  let payload;
  try { payload = JSON.parse(text); } catch {
    const error = new Error(`解析服务返回了无效 JSON（HTTP ${response.status}）`);
    error.code = "PARSER_INVALID_JSON";
    error.status = 502;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`解析服务请求失败（HTTP ${response.status}）`);
    error.code = `PARSER_HTTP_${response.status}`;
    error.status = 502;
    throw error;
  }
  if (payload?.success === false) {
    const error = new Error(typeof payload.message === "string" ? payload.message : "解析服务未能识别该链接");
    error.code = "PARSER_REJECTED";
    error.status = 422;
    throw error;
  }
  log("INFO", "parser_request_success", { source: safeUrl(targetUrl), endpoint: safeUrl(endpoint), keys: Object.keys(payload).slice(0, 20) });
  return payload;
}

export function parserEndpoint() {
  return process.env.ZJJX_API_ENDPOINT || DEFAULT_ENDPOINT;
}
