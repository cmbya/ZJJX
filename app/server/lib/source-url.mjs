const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’]+/giu;
const TRAILING_PUNCTUATION = /[),.;!?，。！？；：、）】》」』]+$/u;

function cleanUrl(value) {
  return value.replace(TRAILING_PUNCTUATION, "");
}

export function extractSourceUrls(value) {
  if (typeof value !== "string") return [];
  const urls = [];
  const seen = new Set();
  for (const match of value.matchAll(HTTP_URL_PATTERN)) {
    const url = cleanUrl(match[0]);
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export function extractSourceUrl(value) {
  return extractSourceUrls(value)[0] || "";
}
