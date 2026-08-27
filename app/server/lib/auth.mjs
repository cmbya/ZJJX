export function getGatewayUser(req) {
  const isAdmin = String(req.headers["x-trim-isadmin"] || "").toLowerCase() === "true";
  const uid = String(req.headers["x-trim-userid"] || "").trim();
  const username = String(req.headers["x-trim-username"] || "").trim();
  return { uid: uid || "unknown", username: username || "unknown", isAdmin };
}

export function assertAdmin(req) {
  const user = getGatewayUser(req);
  const localAdmin = process.env.ZJJX_ALLOW_LOCAL_ADMIN === "1";
  if (!user.isAdmin && !localAdmin) {
    const error = new Error("仅 NAS 管理员可以使用 ZJJX");
    error.code = "ADMIN_REQUIRED";
    error.status = 403;
    throw error;
  }
  return localAdmin && !user.isAdmin
    ? { ...user, uid: "local-admin", username: "local-admin", isAdmin: true }
    : user;
}
