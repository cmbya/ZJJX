import test from "node:test";
import assert from "node:assert/strict";
import { extractSourceUrl } from "../app/server/lib/source-url.mjs";

test("从抖音分享文案中提取真实链接", () => {
  const value = "9.25 复制打开抖音，看看【FTm_咪咪（广融）🏂的作品】  https://v.douyin.com/Nc_eF_7yZvE/ :1pm o@Q.kc 11/05 HVy:/";
  assert.equal(extractSourceUrl(value), "https://v.douyin.com/Nc_eF_7yZvE/");
});

test("纯链接保持不变", () => {
  assert.equal(extractSourceUrl("https://example.com/video?id=1"), "https://example.com/video?id=1");
});

test("没有链接时返回空字符串", () => {
  assert.equal(extractSourceUrl("这不是一个链接"), "");
});
