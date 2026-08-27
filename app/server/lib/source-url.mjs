const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’]+/iu;
const TRAILING_PUNCTUATION = /[),.;!?，。！？；：、）】》」』]+$/u;

export function extractSourceUrl(value) {
  if (typeof value !== "string") return "";
  const match = value.match(HTTP_URL_PATTERN);
  if (!match) return "";
  return match[0].replace(TRAILING_PUNCTUATION, "");
}
