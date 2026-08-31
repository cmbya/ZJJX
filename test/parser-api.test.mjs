import test from "node:test";
import assert from "node:assert/strict";
import { resolveViaApi } from "../app/server/lib/parser-api.mjs";

function pageResponse(html) {
  return {
    status: 200,
    ok: true,
    headers: new Headers(),
    text: async () => html,
  };
}

test("抖音主解析缺账号资料时直接从抖音页面补全昵称和抖音号", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const html = `<script>window._ROUTER_DATA = {"loaderData":{"note_(id)/page":{"videoInfoRes":{"item_list":[{"author":{"nickname":"真实昵称","unique_id":"douyin_account"}}]}}}}</script>`;
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === "https://jx.wxss.dpdns.org/api/shortcut/resolve") {
      return new Response(JSON.stringify({
        success: true,
        platform: "douyin",
        type: "images",
        author: "错误作者",
        image_urls: ["https://cdn.example/a.jpg"],
      }), { status: 200 });
    }
    if (href === "https://v.douyin.com/example/") return pageResponse(html);
    throw new Error(`unexpected URL: ${href}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await resolveViaApi("https://v.douyin.com/example/", { apiKey: "test-key" });

  assert.equal(result.author, "真实昵称");
  assert.equal(result.unique_id, "douyin_account");
  assert.deepEqual(calls, [
    "https://jx.wxss.dpdns.org/api/shortcut/resolve",
    "https://v.douyin.com/example/",
  ]);
});

test("主解析已经给出抖音号时不再请求抖音页面", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.equal(String(url), "https://jx.wxss.dpdns.org/api/shortcut/resolve");
    return new Response(JSON.stringify({
      success: true,
      platform: "douyin",
      type: "images",
      author: "真实昵称",
      unique_id: "douyin_account",
      image_urls: ["https://cdn.example/a.jpg"],
    }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await resolveViaApi("https://v.douyin.com/example/", { apiKey: "test-key" });

  assert.equal(result.unique_id, "douyin_account");
  assert.equal(calls, 1);
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
