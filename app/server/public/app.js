import { extractSourceUrls } from "../lib/source-url.mjs";

const BASE = "/app/ZJJX";
const $ = (selector) => document.querySelector(selector);
let previewItems = [];
let batchRunId = 0;
let parsing = false;
let batchActionBusy = false;
let downloadDirectoryConfigured = false;

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || ("请求失败（" + response.status + "）"));
  return data;
}

function bytes(value) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let number = value;
  let index = 0;
  while (number >= 1024 && index < units.length - 1) {
    number /= 1024;
    index += 1;
  }
  return number.toFixed(index ? 1 : 0) + " " + units[index];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((item) => {
    item.classList.toggle("hidden", item.id !== "page-" + page);
  });
  document.querySelectorAll(".nav").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });
  if (page === "tasks") loadTasks();
}

async function loadHealth() {
  try {
    const data = await request("/api/health");
    downloadDirectoryConfigured = data.downloadDirectoryConfigured;
    $("#health").innerHTML =
      "<div><strong>管理员校验通过</strong><span class=\"muted\"> API Key：" +
      (data.apiKeyConfigured ? "已配置" : "未配置") +
      "　下载目录：" +
      (data.downloadDirectoryConfigured ? "已授权" : "未授权") +
      "</span></div>" +
      (!data.apiKeyConfigured || !data.downloadDirectoryConfigured
        ? "<div class=\"warning\">请先到飞牛应用设置完成配置。</div>"
        : "");
    renderBatch();
  } catch (error) {
    $("#health").innerHTML = "<strong class=\"error\">" + escapeHtml(error.message) + "</strong>";
  }
}

function itemStatusLabel(status) {
  return ({
    parsing: "解析中",
    parsed: "等待确认下载",
    queueing: "正在加入队列",
    queued: "排队中",
    downloading: "正在下载",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消"
  }[status] || status);
}

function mediaSummary(media) {
  if (media.mediaType === "images") return "图片组，共 " + media.count + " 张";
  return "视频";
}

function renderItem(item) {
  const number = "<span class=\"item-number\">#" + item.index + "</span>";
  const source = "<p class=\"source-line\">" + escapeHtml(item.url) + "</p>";

  if (item.status === "parsing") {
    return "<article class=\"preview-card item-pending\"><div class=\"preview-body\"><div class=\"item-heading\">" +
      number + "<span class=\"badge parsing\">解析中</span></div><h2>正在解析</h2>" + source +
      "</div></article>";
  }

  if (item.status === "failed") {
    return "<article class=\"preview-card item-failed\"><div class=\"preview-body\"><div class=\"item-heading\">" +
      number + "<span class=\"badge failed\">解析失败</span></div><h2>无法解析</h2>" + source +
      "<p class=\"error\">" + escapeHtml(item.error || "解析失败") + "</p></div></article>";
  }

  if (item.status === "cancelled") {
    return "<article class=\"preview-card item-cancelled\"><div class=\"preview-body\"><div class=\"item-heading\">" +
      number + "<span class=\"badge\">已取消</span></div><h2>" + escapeHtml(item.data?.media?.title || "已取消") +
      "</h2>" + source + "</div></article>";
  }

  const media = item.data.media;
  const image = media.thumbnail
    ? "<img class=\"cover\" src=\"" + escapeHtml(media.thumbnail) + "\" alt=\"封面\" referrerpolicy=\"no-referrer\">"
    : "<div class=\"cover placeholder\">ZJJX</div>";
  const thumbs = media.mediaType === "images" && Array.isArray(media.imageUrls)
    ? "<div class=\"thumbs\">" + media.imageUrls.slice(0, 6).map((url) =>
      "<img src=\"" + escapeHtml(url) + "\" referrerpolicy=\"no-referrer\">").join("") + "</div>"
    : "";
  let action = "";
  if (item.status === "parsed") {
    action = "<button class=\"primary confirm-item\" data-index=\"" + item.index + "\"" +
      (downloadDirectoryConfigured ? "" : " disabled") + ">确认下载</button>" +
      "<button class=\"secondary cancel-item\" data-index=\"" + item.index + "\">取消</button>";
  } else if (item.status === "queueing") {
    action = "<button class=\"primary\" disabled>正在加入队列</button>";
  } else {
    action = "<button class=\"primary\" disabled>" + escapeHtml(itemStatusLabel(item.status)) + "</button>";
  }

  const actionError = item.actionError
    ? "<p class=\"error\">" + escapeHtml(item.actionError) + "</p>"
    : "";
  const warning = downloadDirectoryConfigured
    ? ""
    : "<p class=\"warning\">请先在飞牛应用设置中授权下载目录，完成授权后才能下载。</p>";

  return "<article class=\"preview-card\"><div class=\"preview-media\">" + image + "</div><div class=\"preview-body\">" +
    "<div class=\"item-heading\">" + number + "<span class=\"badge " + escapeHtml(item.status) + "\">" +
    escapeHtml(itemStatusLabel(item.status)) + "</span></div>" +
    "<p class=\"eyebrow\">" + escapeHtml(item.data.parser) + "</p>" +
    "<h2>" + escapeHtml(media.title) + "</h2>" +
    "<p class=\"muted\">" + escapeHtml(media.platform) +
    (media.author ? " · " + escapeHtml(media.author) : "") + " · " + mediaSummary(media) + "</p>" +
    thumbs + warning + actionError +
    "<div class=\"form-row\">" + action + "</div></div></article>";
}

function renderBatch() {
  const preview = $("#preview");
  const items = $("#preview-items");
  const summary = $("#batch-summary");
  const allButton = $("#download-all");

  if (!preview || !items) return;
  preview.classList.toggle("hidden", previewItems.length === 0);
  if (!previewItems.length) {
    items.innerHTML = "";
    if (summary) summary.textContent = "";
    if (allButton) allButton.disabled = true;
    return;
  }

  const successCount = previewItems.filter((item) => item.data && item.status !== "cancelled").length;
  const parsedCount = previewItems.filter((item) => item.status === "parsed").length;
  const failedCount = previewItems.filter((item) => item.status === "failed").length;
  const parsingCount = previewItems.filter((item) => item.status === "parsing").length;
  const activeCount = previewItems.length - failedCount;
  if (summary) {
    summary.textContent = "共 " + previewItems.length + " 个链接 · 已处理 " +
      (previewItems.length - parsingCount) + " / " + previewItems.length +
      " · 成功 " + successCount + " · 失败 " + failedCount +
      (parsingCount ? " · 正在解析 " + parsingCount : "");
  }
  if (allButton) {
    allButton.disabled = batchActionBusy || parsedCount === 0 || !downloadDirectoryConfigured;
    allButton.textContent = batchActionBusy ? "正在加入下载队列…" : "一键下载全部解析成功项";
  }
  items.innerHTML = previewItems.map(renderItem).join("");
  document.querySelectorAll(".confirm-item").forEach((button) => {
    button.onclick = () => enqueueItem(previewItems.find((item) => item.index === Number(button.dataset.index)));
  });
  document.querySelectorAll(".cancel-item").forEach((button) => {
    button.onclick = () => {
      const item = previewItems.find((entry) => entry.index === Number(button.dataset.index));
      if (!item || ["queued", "downloading", "succeeded"].includes(item.status)) return;
      item.status = "cancelled";
      item.previewToken = "";
      renderBatch();
    };
  });
}

async function enqueueItem(item) {
  if (!item || item.status !== "parsed" || !item.previewToken || !downloadDirectoryConfigured) return;
  item.status = "queueing";
  item.actionError = "";
  renderBatch();
  try {
    const result = await request("/api/downloads", {
      method: "POST",
      body: JSON.stringify({ previewToken: item.previewToken })
    });
    item.taskId = result.task.id;
    item.status = result.task.status || "queued";
    item.previewToken = "";
  } catch (error) {
    item.status = "parsed";
    item.actionError = error.message;
  }
  renderBatch();
}

async function downloadAll() {
  if (batchActionBusy) return;
  const items = previewItems.filter((item) =>
    item.status === "parsed" && item.previewToken && downloadDirectoryConfigured);
  if (!items.length) return;
  if (!confirm("将把 " + items.length + " 个解析成功项加入下载队列，是否继续？")) return;

  batchActionBusy = true;
  renderBatch();
  for (const item of items) await enqueueItem(item);
  batchActionBusy = false;
  renderBatch();
}

async function parseBatch(event) {
  event.preventDefault();
  if (parsing) return;
  const urls = extractSourceUrls($("#source-url").value.trim());
  $("#resolve-error").textContent = "";
  if (!urls.length) {
    $("#resolve-error").textContent = "没有识别到有效链接";
    return;
  }
  if (urls.length > 20) {
    $("#resolve-error").textContent = "一次最多支持 20 个链接，当前识别到 " + urls.length + " 个";
    return;
  }

  const runId = ++batchRunId;
  parsing = true;
  const submit = $("#resolve-form button[type=\"submit\"]");
  if (submit) submit.disabled = true;
  previewItems = urls.map((url, index) => ({
    index: index + 1,
    url,
    status: "parsing",
    previewToken: "",
    data: null,
    error: "",
    actionError: ""
  }));
  renderBatch();

  for (const item of previewItems) {
    try {
      const data = await request("/api/resolve", {
        method: "POST",
        body: JSON.stringify({ url: item.url })
      });
      if (runId !== batchRunId) return;
      item.data = data;
      item.previewToken = data.previewToken;
      item.status = "parsed";
    } catch (error) {
      if (runId !== batchRunId) return;
      item.status = "failed";
      item.error = error.message;
    }
    renderBatch();
  }

  if (runId === batchRunId) {
    parsing = false;
    if (submit) submit.disabled = false;
    renderBatch();
  }
}

async function loadTasks() {
  try {
    const data = await request("/api/tasks");
    const byId = new Map(data.tasks.map((task) => [task.id, task]));
    let changed = false;
    for (const item of previewItems) {
      if (!item.taskId || !byId.has(item.taskId)) continue;
      const nextStatus = byId.get(item.taskId).status;
      if (item.status !== nextStatus) {
        item.status = nextStatus;
        changed = true;
      }
    }
    if (changed && !$("#page-parse").classList.contains("hidden")) renderBatch();

    $("#tasks").innerHTML = data.tasks.length
      ? data.tasks.map((task) =>
        "<article class=\"task\"><div class=\"task-main\"><div><strong>" +
        escapeHtml(task.title) + "</strong><p class=\"muted\">" +
        escapeHtml(task.platform) + " · " + escapeHtml(task.mediaType) + " · " +
        new Date(task.createdAt).toLocaleString() +
        "</p></div><span class=\"badge " + escapeHtml(task.status) + "\">" +
        escapeHtml(itemStatusLabel(task.status)) + "</span></div>" +
        "<div class=\"progress\"><i style=\"width:" +
        (task.progress?.total ? Math.min(100, task.progress.completed / task.progress.total * 100) : 0) +
        "%\"></i></div><p class=\"muted\">" +
        (task.progress?.completed || 0) + " / " + (task.progress?.total || task.count) + "　" +
        bytes(task.progress?.bytes) +
        (task.error ? "　<span class=\"error\">" + escapeHtml(task.error) + "</span>" : "") +
        "</p>" +
        (task.savedPaths?.length ? "<p class=\"path\">" +
          task.savedPaths.map(escapeHtml).join("<br>") + "</p>" : "") +
        "</article>").join("")
      : "<div class=\"empty\">还没有下载任务。</div>";
  } catch (error) {
    $("#tasks").innerHTML = "<div class=\"error\">" + escapeHtml(error.message) + "</div>";
  }
}

$("#resolve-form").onsubmit = parseBatch;
$("#download-all").onclick = downloadAll;
$("#clear-previews").onclick = () => {
  ++batchRunId;
  parsing = false;
  previewItems = [];
  const submit = $("#resolve-form button[type=\"submit\"]");
  if (submit) submit.disabled = false;
  $("#resolve-error").textContent = "";
  renderBatch();
};
$("#clear-tasks").onclick = async () => {
  if (!confirm("只清理应用内历史记录，不会删除已经下载的文件。继续吗？")) return;
  await request("/api/tasks", { method: "DELETE" });
  loadTasks();
};
document.querySelectorAll(".nav").forEach((item) => {
  item.onclick = () => showPage(item.dataset.page);
});
loadHealth();
setInterval(() => {
  if (!$("#page-tasks").classList.contains("hidden") ||
      previewItems.some((item) => item.taskId && ["queued", "downloading"].includes(item.status))) {
    loadTasks();
  }
}, 3000);
