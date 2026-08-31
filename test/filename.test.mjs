import test from "node:test";
import assert from "node:assert/strict";
import { safeSegment } from "../app/server/lib/filename.mjs";
import { buildDownloadDirectory } from "../app/server/lib/downloader.mjs";

test("文件名过滤路径字符和目录穿越", () => {
  assert.equal(safeSegment("../a:b\\c"), "__a_b_c");
  assert.equal(safeSegment("   ...   "), "未命名");
});

test("下载目录使用平台和用户名，不再包含日期和标题目录", () => {
  const result = buildDownloadDirectory("/downloads", { platform: "Instagram", author: "显示名称", username: "user/name" });
  assert.equal(result.platform, "instagram");
  assert.equal(result.username, "user_name");
  assert.equal(result.directory, "/downloads/instagram/user_name");
});
