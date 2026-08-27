import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = ["manifest", "ICON.PNG", "ICON_256.PNG", "config/privilege", "config/resource", "app/ui/config", "cmd/main", "wizard/install", "wizard/config", "app/server/index.mjs", "app/server/public/index.html"];
for (const item of required) {
  try { await fs.access(path.join(root, item)); } catch { throw new Error(`缺少 FPK 必需文件：${item}`); }
}
JSON.parse(await fs.readFile(path.join(root, "config/privilege"), "utf8"));
JSON.parse(await fs.readFile(path.join(root, "config/resource"), "utf8"));
JSON.parse(await fs.readFile(path.join(root, "app/ui/config"), "utf8"));
JSON.parse(await fs.readFile(path.join(root, "wizard/install"), "utf8"));
JSON.parse(await fs.readFile(path.join(root, "wizard/config"), "utf8"));
const manifest = await fs.readFile(path.join(root, "manifest"), "utf8");
if (!/^appname=ZJJX$/m.test(manifest) || !/^version=\d+\.\d+\.\d+$/m.test(manifest)) throw new Error("manifest 的 appname 或 version 无效");
console.log("ZJJX 应用包源文件检查通过。运行 fnpack build 生成 FPK。");
