import path from "node:path";

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

export function safeSegment(value, fallback = "未命名") {
  const clean = String(value || "")
    .replace(ILLEGAL, "_")
    .replace(/[. ]+$/g, "")
    .replace(/\.\./g, "_")
    .trim();
  return clean.slice(0, 180) || fallback;
}

export function extensionFor(url, contentType = "") {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.(jpe?g|png|webp|gif|avif|heic|bmp)$/.test(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  } catch {}
  const type = contentType.toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return ".jpg";
}

export async function uniquePath(fs, directory, baseName, extension) {
  let candidate = path.join(directory, `${baseName}${extension}`);
  let index = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${baseName} (${index})${extension}`);
      index += 1;
    } catch (error) {
      if (error.code === "ENOENT") return candidate;
      throw error;
    }
  }
}
