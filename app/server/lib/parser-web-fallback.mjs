export async function resolveViaWebFallback() {
  const error = new Error("网页账号密码备用通道尚未适配当前网页接口，请使用 API Key 通道");
  error.code = "WEB_FALLBACK_EXPERIMENTAL_UNAVAILABLE";
  error.status = 501;
  throw error;
}
