import fs from "node:fs/promises";

export async function validateVideo(file) {
  const buffer = await fs.readFile(file);
  const ftypAt = buffer.indexOf(Buffer.from("ftyp"));
  if (ftypAt < 0 || ftypAt > 32) return { ok: false, reason: "不是 MP4 容器" };
  const hasH264 = buffer.includes(Buffer.from("avc1"));
  const hasHevc = buffer.includes(Buffer.from("hvc1")) || buffer.includes(Buffer.from("hev1"));
  if (!hasH264 && !hasHevc) return { ok: false, reason: "视频编码不是 H.264 或 HEVC" };
  return { ok: true, codec: hasH264 ? "H.264" : "HEVC", bytes: buffer.byteLength };
}
