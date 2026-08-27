import test from "node:test";
import assert from "node:assert/strict";
import { safeSegment } from "../app/server/lib/filename.mjs";

test("文件名过滤路径字符和目录穿越", () => {
  assert.equal(safeSegment("../a:b\\c"), "__a_b_c");
  assert.equal(safeSegment("   ...   "), "未命名");
});
