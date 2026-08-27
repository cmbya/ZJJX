import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertAdmin } from "./lib/auth.mjs";
import { loadConfig, getAuthorizedRoots } from "./lib/config.mjs";
import { resolveViaApi } from "./lib/parser-api.mjs";
import { resolveViaWebFallback } from "./lib/parser-web-fallback.mjs";
import { normalizeMedia } from "./lib/media-normalizer.mjs";
import { DownloadQueue } from "./lib/download-queue.mjs";
import { initTaskStore, createTask, listTasks, getTask, clearTasks } from "./lib/task-store.mjs";
import { errorDetails, log, safeUrl } from "./lib/logger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PREFIX = "/app/zjjx";
const previews = new Map();
const queue = new DownloadQueue();

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

function errorResponse(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  json(res, status, { ok: false, error: error.message || "服务器内部错误", code: error.code || "INTERNAL_ERROR" });
}

function routePath(req) {
  const url = new URL(req.url || "/", "http://zjjx.local");
  if (url.pathname === PREFIX) return "/";
  if (url.pathname.startsWith(`${PREFIX}/`)) return url.pathname.slice(PREFIX.length) || "/";
  return url.pathname;
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_048_576) {
      const error = new Error("请求内容过大");
      error.status = 413;
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch {
    const error = new Error("请求 JSON 格式无效");
    error.status = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
}

function publicMedia(media) {
  return {
    platform: media.platform,
    author: media.author,
    title: media.title,
    thumbnail: media.thumbnail,
    mediaType: media.mediaType,
    count: media.count,
    imageUrls: media.imageUrls,
    videoUrl: media.videoUrl
  };
}

function validateInputUrl(value) {
  if (typeof value !== "string" || value.trim().length < 8 || value.length > 4096) {
    const error = new Error("请输入一条有效的公开内容链接");
    error.status = 400;
    error.code = "INVALID_SOURCE_URL";
    throw error;
  }
  let url;
  try { url = new URL(value.trim()); } catch {
    const error = new Error("链接格式无效");
    error.status = 400;
    error.code = "INVALID_SOURCE_URL";
    throw error;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    const error = new Error("仅支持不带账号密码的 HTTP/HTTPS 内容链接");
    error.status = 400;
    error.code = "INVALID_SOURCE_URL";
    throw error;
  }
  return url.href;
}

function prunePreviews() {
  const now = Date.now();
  for (const [token, item] of previews) if (item.expiresAt <= now) previews.delete(token);
}

async function resolve(body, user) {
  const sourceUrl = validateInputUrl(body.url);
  log("INFO", "resolve_start", { source: safeUrl(sourceUrl), user: user.username });
  const config = await loadConfig();
  let raw;
  let parser = "api-key";
  try {
    raw = await resolveViaApi(sourceUrl, config);
  } catch (apiError) {
    log("WARN", "resolve_api_failed", { source: safeUrl(sourceUrl), error: errorDetails(apiError) });
    if (!config.webUsername || !config.webPassword) throw apiError;
    parser = "web-fallback-experimental";
    raw = await resolveViaWebFallback(sourceUrl, config);
  }
  const media = normalizeMedia(raw, sourceUrl);
  const token = crypto.randomBytes(32).toString("base64url");
  previews.set(token, { userId: user.uid, media, parser, expiresAt: Date.now() + 30 * 60 * 1000 });
  log("INFO", "resolve_success", { source: safeUrl(sourceUrl), parser, mediaType: media.mediaType, count: media.count });
  return { previewToken: token, parser, expiresInSeconds: 1800, media: publicMedia(media) };
}

async function createDownload(body, user) {
  prunePreviews();
  if (typeof body.previewToken !== "string") {
    const error = new Error("预览令牌无效，请重新解析");
    error.status = 400;
    error.code = "PREVIEW_TOKEN_INVALID";
    throw error;
  }
  const item = previews.get(body.previewToken);
  if (!item || item.userId !== user.uid || item.expiresAt <= Date.now()) {
    previews.delete(body.previewToken);
    const error = new Error("预览已过期，请重新解析");
    error.status = 410;
    error.code = "PREVIEW_TOKEN_EXPIRED";
    throw error;
  }
  previews.delete(body.previewToken);
  const task = await createTask(item.media, user);
  queue.enqueue(task, item.media);
  return { task };
}

async function serveStatic(req, res, requestPath) {
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\//, "");
  if (relative.includes("..") || relative.includes("\\")) return json(res, 400, { error: "Bad Request" });
  const file = path.join(PUBLIC_DIR, relative);
  try {
    const content = await fs.readFile(file);
    const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
    res.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return serveStatic(req, res, "/");
    errorResponse(res, error);
  }
}

async function handle(req, res) {
  const requestPath = routePath(req);
  if (!requestPath.startsWith("/api/")) return serveStatic(req, res, requestPath);
  const user = assertAdmin(req);
  if (req.method === "GET" && requestPath === "/api/health") {
    const config = await loadConfig();
    return json(res, 200, { ok: true, admin: true, apiKeyConfigured: Boolean(config.apiKey), webAccountConfigured: Boolean(config.webUsername && config.webPassword), downloadDirectoryConfigured: getAuthorizedRoots().length > 0 });
  }
  if (req.method === "POST" && requestPath === "/api/resolve") return json(res, 200, { ok: true, ...(await resolve(await readBody(req), user)) });
  if (req.method === "POST" && requestPath === "/api/downloads") return json(res, 202, { ok: true, ...(await createDownload(await readBody(req), user)) });
  if (req.method === "GET" && requestPath === "/api/tasks") return json(res, 200, { ok: true, tasks: await listTasks(user) });
  const taskMatch = requestPath.match(/^\/api\/tasks\/([a-z0-9]+)$/);
  if (req.method === "GET" && taskMatch) {
    const task = await getTask(taskMatch[1], user);
    if (!task) return json(res, 404, { ok: false, error: "任务不存在", code: "TASK_NOT_FOUND" });
    return json(res, 200, { ok: true, task });
  }
  if (req.method === "DELETE" && requestPath === "/api/tasks") {
    await clearTasks(user);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { ok: false, error: "接口不存在", code: "NOT_FOUND" });
}

log("INFO", "service_boot", {
  node: process.version,
  pid: process.pid,
  appDest: process.env.TRIM_APPDEST || "",
  configDir: process.env.TRIM_PKGETC || process.env.ZJJX_CONFIG_DIR || "",
  varDir: process.env.TRIM_PKGVAR || process.env.ZJJX_VAR_DIR || "",
  systemArch: process.env.TRIM_SYS_ARCH || "unknown"
});
try {
  await initTaskStore();
  log("INFO", "task_store_ready");
} catch (error) {
  log("ERROR", "task_store_init_failed", { error: errorDetails(error) });
  throw error;
}

const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const requestPath = routePath(req);
  log("INFO", "request_start", { method: req.method, path: requestPath });
  res.on("finish", () => log("INFO", "request_end", { method: req.method, path: requestPath, status: res.statusCode, durationMs: Date.now() - startedAt }));
  handle(req, res).catch((error) => {
    log("ERROR", "request_failed", { method: req.method, path: requestPath, error: errorDetails(error) });
    errorResponse(res, error);
  });
});
server.on("error", (error) => log("ERROR", "server_error", { error: errorDetails(error) }));
const socketPath = process.env.SOCKET_PATH || (process.env.TRIM_APPDEST ? path.join(process.env.TRIM_APPDEST, "app.sock") : "");
if (socketPath) {
  await fs.rm(socketPath, { force: true });
  server.listen(socketPath, () => log("INFO", "service_listening", { transport: "unix", socketPath }));
} else {
  const port = Number(process.env.PORT || 12147);
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => log("INFO", "service_listening", { transport: "tcp", host, port }));
}

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
