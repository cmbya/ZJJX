import test from "node:test";
import assert from "node:assert/strict";
import { resolveViaApi } from "../app/server/lib/parser-api.mjs";

test("抖音主解析缺账号资料时补全昵称和抖音号", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.startsWith("https://jx.wxss.dpdns.org/")) {
      return new Response(JSON.stringify({
        success: true,
        platform: "douyin",
        type: "images",
        author: "错误作者",
        image_urls: ["https://cdn.example/a.jpg"],
      }), { status: 200 });
    }
    if (href.startsWith("https://parse.shenzjd.com/api/douyin")) {
      return new Response(JSON.stringify({
        code: 200,
        data: { author: "真实昵称", uid: "douyin_account" },
      }), { status: 200 });
    }
    throw new Error(`unexpected URL: ${href}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await resolveViaApi("https://v.douyin.com/example/", { apiKey: "test-key" });

  assert.equal(result.author, "真实昵称");
  assert.equal(result.unique_id, "douyin_account");
  assert.equal(calls.length, 2);
});

test("非抖音内容不调用账号补全服务", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      success: true,
      platform: "instagram",
      type: "images",
      author: "作者",
      image_urls: ["https://cdn.example/a.jpg"],
    }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await resolveViaApi("https://www.instagram.com/p/example/", { apiKey: "test-key" });

  assert.equal(result.author, "作者");
  assert.equal(calls, 1);
});
