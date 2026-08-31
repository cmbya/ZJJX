const DEFAULT_ENDPOINT = "https://jx.wxss.dpdns.org/api/shortcut/resolve";
import { errorDetails, log, safeUrl } from "./logger.mjs";

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return { controller, clear: () => clearTimeout(timer) };
}

function stringValue(data, fields) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  for (const field of fields) {
    if (typeof data[field] === "string" && data[field].trim()) return data[field].trim();
  }
  return "";
}

function isDouyin(payload) {
  const platform = String(payload?.platform || payload?.site || payload?.source || "").trim().toLowerCase();
  return platform === "douyin" || platform === "抖音";
}

function hasAccountIdentity(payload) {
  return Boolean(stringValue(payload, [
    "unique_id", "uniqueId", "uid", "userId", "user_id", "authorId", "authorID", "sec_uid",
    "author_username", "author_handle", "handle", "screen_name", "username", "user_name",
  ]));
}

const DOUYIN_MOBILE_HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9",
};

function isAllowedDouyinUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && (
      hostname === "douyin.com" || hostname.endsWith(".douyin.com") ||
      hostname === "iesdouyin.com" || hostname.endsWith(".iesdouyin.com")
    );
  } catch {
    return false;
  }
}

function extractTtwid(response) {
  try {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const match = String(value).match(/(?:^|,\s*)ttwid=([^;,\s]+)/);
      if (match) return "ttwid=" + match[1];
    }
  } catch {}
  return "";
}

function parseEmbeddedDouyinData(html) {
  const router = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s);
  if (router?.[1]) {
    try { return JSON.parse(router[1].trim().replace(/;$/, "")); } catch {}
  }
  const render = html.match(/<script[^>]+id=["']RENDER_DATA["'][^>]*>(.*?)<\/script>/s);
  if (render?.[1]) {
    try { return JSON.parse(decodeURIComponent(render[1].trim())); } catch {}
  }
  const ssr = html.match(/window\._SSR_(?:HYDRATED_)?DATA\s*=\s*(.*?)<\/script>/s);
  if (ssr?.[1]) {
    try { return JSON.parse(ssr[1].trim().replace(/;$/, "")); } catch {}
  }
  return null;
}

function extractDouyinIdentityFromHtml(html) {
  const data = parseEmbeddedDouyinData(html);
  if (!data || typeof data !== "object") return null;
  const loaderData = data.loaderData;
  if (!loaderData || typeof loaderData !== "object") return null;
  for (const page of Object.values(loaderData)) {
    const item = page?.videoInfoRes?.item_list?.[0];
    const profile = item?.author;
    if (!profile || typeof profile !== "object") continue;
    const username = stringValue(profile, ["unique_id", "uniqueId", "uid", "short_id"]);
    const author = stringValue(profile, ["nickname", "name"]);
    if (username || author) return { username, author };
  }
  return null;
}

function extractDouyinContent(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/(video|note|story)\/(\d{17,19})/);
    return match ? { type: match[1], id: match[2] } : null;
  } catch {
    return null;
  }
}

async function fetchDouyinPage(rawUrl, headers, signal) {
  let url = new URL(rawUrl);
  if (!isAllowedDouyinUrl(url.href)) throw new Error("抖音链接地址无效");
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetch(url, { method: "GET", headers, redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      const next = new URL(response.headers.get("location"), url);
      if (!isAllowedDouyinUrl(next.href)) throw new Error("抖音链接重定向地址无效");
      url = next;
      continue;
    }
    return { response, url: url.href };
  }
  throw new Error("抖音链接重定向次数过多");
}

async function enrichDouyinIdentity(payload, targetUrl) {
  if (!isDouyin(payload) || hasAccountIdentity(payload)) return payload;
  if (!isAllowedDouyinUrl(targetUrl)) {
    log("WARNING", "douyin_identity_direct_skipped", { source: safeUrl(targetUrl), reason: "invalid_source" });
    return payload;
  }

  const timeoutMs = Number(process.env.ZJJX_DOUYIN_IDENTITY_TIMEOUT_MS || 20000);
  const timeout = withTimeout(timeoutMs);
  let ttwid = "";
  const readIdentity = async (page) => {
    const html = await page.response.text();
    const newTtwid = extractTtwid(page.response);
    if (newTtwid) ttwid = newTtwid;
    return { identity: extractDouyinIdentityFromHtml(html), finalUrl: page.url };
  };
  const headers = () => ({
    ...DOUYIN_MOBILE_HEADERS,
    ...(ttwid ? { cookie: ttwid } : {}),
  });
  const applyIdentity = (identity) => {
    log("INFO", "douyin_identity_direct_success", {
      source: safeUrl(targetUrl), hasUsername: Boolean(identity.username), hasAuthor: Boolean(identity.author),
    });
    return {
      ...payload,
      ...(identity.author ? { author: identity.author } : {}),
      ...(identity.username ? { unique_id: identity.username } : {}),
    };
  };

  log("INFO", "douyin_identity_direct_start", { source: safeUrl(targetUrl), timeoutMs });
  try {
    const initial = await readIdentity(await fetchDouyinPage(targetUrl, headers(), timeout.controller.signal));
    if (initial.identity) return applyIdentity(initial.identity);

    const content = extractDouyinContent(initial.finalUrl);
    if (!content) {
      log("WARNING", "douyin_identity_direct_missing", { source: safeUrl(targetUrl), reason: "content_id_missing" });
      return payload;
    }
    const urls = [
      initial.finalUrl,
      `https://www.iesdouyin.com/share/${content.type}/${content.id}`,
      `https://m.douyin.com/share/${content.type}/${content.id}`,
      `https://www.douyin.com/${content.type}/${content.id}`,
    ];
    for (let round = 0; round < 2; round += 1) {
      const seen = new Set();
      for (const url of urls) {
        if (seen.has(url) || timeout.controller.signal.aborted) continue;
        seen.add(url);
        const page = await readIdentity(await fetchDouyinPage(url, headers(), timeout.controller.signal));
        if (page.identity) return applyIdentity(page.identity);
      }
    }
    log("WARNING", "douyin_identity_direct_missing", { source: safeUrl(targetUrl), reason: "identity_missing" });
    return payload;
  } catch (error) {
    log("WARNING", "douyin_identity_direct_failed", {
      source: safeUrl(targetUrl), error: errorDetails(error),
    });
    return payload;
  } finally {
    timeout.clear();
  }
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
  return enrichDouyinIdentity(payload, targetUrl);
}

export function parserEndpoint() {
  return process.env.ZJJX_API_ENDPOINT || DEFAULT_ENDPOINT;
}
