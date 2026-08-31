import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMedia } from "../app/server/lib/media-normalizer.mjs";

test("规范化图片组响应", () => {
  const media = normalizeMedia({ success: true, type: "images", platform: "instagram", title: "旅行", image_urls: ["https://cdn.example/a.jpg", { url: "https://cdn.example/b.jpg" }] }, "https://instagram.com/p/x");
  assert.equal(media.mediaType, "images");
  assert.equal(media.count, 2);
  assert.equal(media.platform, "instagram");
});

test("所有平台优先使用显示昵称作为目录名", () => {
  const media = normalizeMedia({ success: true, type: "images", platform: "instagram", author: "显示名称", username: "user_handle", title: "旅行", image_urls: ["https://cdn.example/a.jpg"] }, "https://instagram.com/p/x");
  assert.equal(media.author, "显示名称");
  assert.equal(media.username, "显示名称");
});

test("用户名缺失时回退到作者字段", () => {
  const media = normalizeMedia({ success: true, type: "images", platform: "instagram", author: "作者", title: "旅行", image_urls: ["https://cdn.example/a.jpg"] }, "https://instagram.com/p/x");
  assert.equal(media.username, "作者");
});

test("抖音解析结果优先使用主播昵称作为目录名", () => {
  const media = normalizeMedia({ success: true, type: "images", platform: "douyin", author: "显示昵称", uid: "real_user_id", title: "旅行", image_urls: ["https://cdn.example/a.jpg"] }, "https://v.douyin.com/x");
  assert.equal(media.author, "显示昵称");
  assert.equal(media.username, "显示昵称");
});

test("抖音直播信息优先使用主播昵称作为目录名", () => {
  const media = normalizeMedia({
    success: true,
    type: "video",
    platform: "douyin",
    username: "错误的显示名称",
    liveInfo: { owner: "主播昵称", remarks: "主播昵称", uid: "douyin_account" },
    title: "直播回放",
    video_url: "https://cdn.example/live.mp4",
  }, "https://v.douyin.com/x");
  assert.equal(media.author, "主播昵称");
  assert.equal(media.username, "主播昵称");
});


test("昵称缺失时回退到平台账号", () => {
  const media = normalizeMedia({ success: true, type: "images", platform: "douyin", uid: "real_user_id", title: "旅行", image_urls: ["https://cdn.example/a.jpg"] }, "https://v.douyin.com/x");
  assert.equal(media.username, "real_user_id");
});

test("规范化嵌套视频响应", () => {
  const media = normalizeMedia({ success: true, data: { platform: "douyin", desc: "作品", video_url: "https://cdn.example/video.mp4" } }, "https://v.douyin.com/x");
  assert.equal(media.mediaType, "video");
  assert.equal(media.videoUrl, "https://cdn.example/video.mp4");
});

test("拒绝没有媒体地址的响应", () => {
  assert.throws(() => normalizeMedia({ success: true, title: "empty" }, "https://example.com/x"), /未找到受支持/);
});
