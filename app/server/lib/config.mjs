import fs from "node:fs/promises";
import path from "node:path";

export function getConfigDir() {
  return process.env.TRIM_PKGETC || process.env.ZJJX_CONFIG_DIR || path.join(process.cwd(), ".zjjx-etc");
}

export function getVarDir() {
  return process.env.TRIM_PKGVAR || process.env.ZJJX_VAR_DIR || path.join(process.cwd(), ".zjjx-var");
}

export async function loadConfig() {
  const file = path.join(getConfigDir(), "config.json");
  try {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
      webUsername: typeof value.webUsername === "string" ? value.webUsername : "",
      webPassword: typeof value.webPassword === "string" ? value.webPassword : ""
    };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return { apiKey: "", webUsername: "", webPassword: "" };
    throw error;
  }
}

export async function saveConfig({ apiKey = "", webUsername = "", webPassword = "" }) {
  const dir = getConfigDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "config.json");
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify({ apiKey, webUsername, webPassword }, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
  await fs.chmod(file, 0o600);
}

export function getAuthorizedRoots() {
  const raw = process.env.TRIM_DATA_ACCESSIBLE_PATHS || process.env.ZJJX_DOWNLOAD_ROOT || "";
  return raw.split(":").map((item) => item.trim()).filter(Boolean);
}

if (process.argv[2] === "write") {
  await saveConfig({
    apiKey: process.env.wizard_api_key || "",
    webUsername: process.env.wizard_web_username || "",
    webPassword: process.env.wizard_web_password || ""
  });
}
