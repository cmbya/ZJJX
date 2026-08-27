import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("版本必须符合 X.Y.Z，例如 1.0.0");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "manifest");
const content = await fs.readFile(file, "utf8");
if (!/^version=/m.test(content)) throw new Error("manifest 缺少 version 字段");
await fs.writeFile(file, content.replace(/^version=.*$/m, `version=${version}`));
console.log(`manifest version 已更新为 ${version}`);
