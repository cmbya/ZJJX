function jsonValue(value) {
  if (value === undefined) return undefined;
  if (value instanceof Error) return errorDetails(value);
  return value;
}

export function errorDetails(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    code: error?.code || undefined,
    status: Number.isInteger(error?.status) ? error.status : undefined,
    stack: error?.stack || undefined
  };
}

export function safeUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

export function log(level, event, fields = {}) {
  const payload = { time: new Date().toISOString(), level, event };
  for (const [key, value] of Object.entries(fields)) {
    const normalized = jsonValue(value);
    if (normalized !== undefined) payload[key] = normalized;
  }
  console.log(`[ZJJX] ${JSON.stringify(payload)}`);
}
