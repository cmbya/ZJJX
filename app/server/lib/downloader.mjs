import dns from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { getAuthorizedRoots } from "./config.mjs";
import { extensionFor, safeSegment, uniquePath } from "./filename.mjs";
import { validateVideo } from "./video-validator.mjs";

const MAX_REDIRECTS = 5;

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

async function assertSafeUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("下载地址无效"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("仅允许不带账号密码的 HTTPS 下载地址");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || (net.isIP(hostname) && isPrivateAddress(hostname))) throw new Error("下载地址指向了受保护的本地网络");
  let addresses;
  try { addresses = net.isIP(hostname) ? [hostname] : (await dns.lookup(hostname, { all: true })).map((item) => item.address); } catch { throw new Error("无法解析下载地址域名"); }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("下载地址指向了受保护的本地网络");
  return url;
}

function shouldAttachKey(url, apiEndpoint) {
  try {
    const endpoint = new URL(apiEndpoint);
    return url.origin === endpoint.origin && url.pathname.startsWith("/api/");
  } catch { return false; }
}

async function fetchSafe(rawUrl, config, apiEndpoint) {
  let url = await assertSafeUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.ZJJX_DOWNLOAD_TIMEOUT_MS || 120000));
    timer.unref?.();
    try {
      const headers = { accept: "*/*" };
      if (config.apiKey && shouldAttachKey(url, apiEndpoint)) headers["x-api-key"] = config.apiKey;
      const response = await fetch(url, { redirect: "manual", signal: controller.signal, headers });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        if (redirects === MAX_REDIRECTS) throw new Error("下载重定向次数过多");
        url = await assertSafeUrl(new URL(response.headers.get("location"), url).href);
        continue;
      }
      if (!response.ok) throw new Error(`媒体下载失败（HTTP ${response.status}）`);
      return { response, url };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("媒体下载超时");
      throw error;
    } finally { clearTimeout(timer); }
  }
  throw new Error("媒体下载失败");
}

async function downloadOne(rawUrl, destination, config, apiEndpoint, expectedType, onProgress) {
  const { response, url } = await fetchSafe(rawUrl, config, apiEndpoint);
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (expectedType === "images" && contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") throw new Error("下载内容不是图片");
  if (expectedType === "video" && contentType && !["video/mp4", "application/mp4", "application/octet-stream"].includes(contentType)) throw new Error("视频不是 MP4 内容");
  const temporary = `${destination}.part`;
  const handle = await fs.open(temporary, "w");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      await handle.write(chunk);
      bytes += chunk.byteLength;
      await onProgress?.(bytes);
    }
  } finally { await handle.close(); }
  await fs.rename(temporary, destination);
  return { bytes, contentType, url };
}

async function firstAuthorizedRoot() {
  for (const candidate of getAuthorizedRoots()) {
    try { if ((await fs.stat(candidate)).isDirectory()) return path.resolve(candidate); } catch {}
  }
  return null;
}

function ensureInside(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("目标路径超出授权目录");
}

function localDate() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export async function downloadMedia(media, taskId, config, apiEndpoint, onProgress) {
  const root = await firstAuthorizedRoot();
  if (!root) throw new Error("没有可用的授权下载目录，请先在飞牛应用设置中授权目录");
  const date = localDate();
  const platform = safeSegment(media.platform, "unknown").toLowerCase();
  const title = safeSegment(media.title, `${platform}-${safeSegment(media.author, "unknown")}-${taskId.slice(0, 6)}`);
  const directory = path.join(root, date, platform, title);
  ensureInside(root, directory);
  await fs.mkdir(directory, { recursive: true, mode: 0o750 });
  const savedPaths = [];
  let totalBytes = 0;
  if (media.mediaType === "images") {
    for (let i = 0; i < media.imageUrls.length; i += 1) {
      const destination = await uniquePath(fs, directory, `${title}-${String(i + 1).padStart(3, "0")}`, extensionFor(media.imageUrls[i]));
      const result = await downloadOne(media.imageUrls[i], destination, config, apiEndpoint, "images", (bytes) => onProgress?.({ completed: i, total: media.imageUrls.length, bytes: totalBytes + bytes }));
      totalBytes += result.bytes;
      savedPaths.push(path.relative(root, destination));
      onProgress?.({ completed: i + 1, total: media.imageUrls.length, bytes: totalBytes });
    }
  } else {
    const destination = await uniquePath(fs, directory, title, ".mp4");
    const result = await downloadOne(media.videoUrl, destination, config, apiEndpoint, "video", (bytes) => onProgress?.({ completed: 0, total: 1, bytes }));
    const validation = await validateVideo(destination);
    if (!validation.ok) { await fs.rm(destination, { force: true }); throw new Error(`视频校验失败：${validation.reason}`); }
    totalBytes = result.bytes;
    savedPaths.push(path.relative(root, destination));
    onProgress?.({ completed: 1, total: 1, bytes: totalBytes });
  }
  return { savedPaths, bytes: totalBytes };
}
