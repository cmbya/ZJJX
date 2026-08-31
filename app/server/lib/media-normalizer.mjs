const URL_FIELDS = ["video_url", "download_url", "media_url", "play_url", "url", "src"];
const IMAGE_FIELDS = ["image_urls", "images", "image_list", "photos", "pictures"];

function unwrap(payload) {
  let current = payload;
  for (let i = 0; i < 4; i += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) break;
    const next = current.data ?? current.result ?? current.detail;
    if (!next || next === current || typeof next !== "object") break;
    current = next;
  }
  return current || {};
}

function toUrl(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return String(value.url || value.src || value.download_url || "").trim();
  return "";
}

function validRemoteUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function collectImages(data) {
  const values = [];
  for (const field of IMAGE_FIELDS) {
    if (!Array.isArray(data[field])) continue;
    for (const item of data[field]) {
      const url = validRemoteUrl(toUrl(item));
      if (url && !values.includes(url)) values.push(url);
    }
  }
  return values;
}

function collectVideo(data) {
  for (const field of URL_FIELDS) {
    const url = validRemoteUrl(toUrl(data[field]));
    if (url) return url;
  }
  for (const field of ["video", "media"]) {
    const url = validRemoteUrl(toUrl(data[field]));
    if (url) return url;
  }
  if (Array.isArray(data.video_urls)) {
    for (const item of data.video_urls) {
      const url = validRemoteUrl(toUrl(item));
      if (url) return url;
    }
  }
  return "";
}

function stringValue(data, fields, fallback = "") {
  for (const field of fields) if (typeof data[field] === "string" && data[field].trim()) return data[field].trim();
  return fallback;
}

function nestedStringValue(data, objectFields, valueFields) {
  const queue = objectFields
    .map((field) => data?.[field])
    .filter((value) => value && typeof value === "object" && !Array.isArray(value))
    .map((value) => ({ value, depth: 0 }));

  while (queue.length) {
    const { value, depth } = queue.shift();
    const result = stringValue(value, valueFields, "");
    if (result) return result;
    if (depth >= 3) continue;
    for (const field of objectFields) {
      const child = value[field];
      if (child && typeof child === "object" && !Array.isArray(child)) {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return "";
}

export function normalizeMedia(payload, sourceUrl) {
  const data = unwrap(payload);
  const images = collectImages(data);
  const videoUrl = collectVideo(data);
  const typeText = String(data.type || data.media_type || data.kind || "").toLowerCase();
  const mediaType = images.length ? "images" : videoUrl || typeText.includes("video") ? "video" : "unknown";
  if (mediaType === "unknown") {
    const error = new Error("解析响应中未找到受支持的视频或图片地址");
    error.code = "MEDIA_UNSUPPORTED";
    error.status = 422;
    throw error;
  }
  const profileObjectFields = [
    "liveInfo", "live_info", "live", "author", "author_info", "authorInfo", "author_data",
    "user", "user_info", "userInfo", "owner", "creator",
  ];
  const stableUsernameFields = [
    "unique_id", "uid", "userId", "user_id", "authorId", "authorID", "sec_uid",
  ];
  const usernameFields = [
    "author_username", "author_handle", "handle", "screen_name", "username", "user_name",
  ];
  const displayNameFields = [
    "owner", "remarks", "author", "author_name", "nickname", "display_name", "name",
  ];
  const platform = stringValue(data, ["platform", "site", "source"], "unknown");
  const author = stringValue(data, displayNameFields, "") ||
    nestedStringValue(data, profileObjectFields, displayNameFields);
  const accountUsername = stringValue(data, stableUsernameFields, "") ||
    nestedStringValue(data, profileObjectFields, stableUsernameFields) ||
    stringValue(data, usernameFields, "") ||
    nestedStringValue(data, profileObjectFields, usernameFields);
  // 所有平台的目录优先使用内容作者昵称；昵称缺失时才使用账号。
  const username = author || accountUsername;
  return {
    platform,
    author,
    username,
    title: stringValue(data, ["title", "desc", "description", "text"], "未命名内容"),
    thumbnail: validRemoteUrl(toUrl(data.thumbnail || data.cover || data.cover_url)) || "",
    mediaType,
    imageUrls: images,
    videoUrl: videoUrl || "",
    sourceUrl,
    count: mediaType === "images" ? images.length : 1
  };
}
