import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMedia } from "../app/server/lib/media-normalizer.mjs";

test("规范化图片组响应", () => {
  const media = normalizeMedia({ success: true, type: "images", platform: "instagram", title: "旅行", image_urls: ["https://cdn.example/a.jpg", { url: "https://cdn.example/b.jpg" }] }, "https://instagram.com/p/x");
  assert.equal(media.mediaType, "images");
  assert.equal(media.count, 2);
  assert.equal(media.platform, "instagram");
});

test("规范化嵌套视频响应", () => {
  const media = normalizeMedia({ success: true, data: { platform: "douyin", desc: "作品", video_url: "https://cdn.example/video.mp4" } }, "https://v.douyin.com/x");
  assert.equal(media.mediaType, "video");
  assert.equal(media.videoUrl, "https://cdn.example/video.mp4");
});

test("拒绝没有媒体地址的响应", () => {
  assert.throws(() => normalizeMedia({ success: true, title: "empty" }, "https://example.com/x"), /未找到受支持/);
});
