const BASE = "/app/zjjx";
const $ = (selector) => document.querySelector(selector);
let previewToken = "";
let downloadDirectoryConfigured = false;

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function bytes(value) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"]; let number = value; let index = 0;
  while (number >= 1024 && index < units.length - 1) { number /= 1024; index += 1; }
  return `${number.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

function showPage(page) {
  document.querySelectorAll(".page").forEach((item) => item.classList.toggle("hidden", item.id !== `page-${page}`));
  document.querySelectorAll(".nav").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
  if (page === "tasks") loadTasks();
}

async function loadHealth() {
  try {
    const data = await request("/api/health");
    downloadDirectoryConfigured = data.downloadDirectoryConfigured;
    $("#health").innerHTML = `<div><strong>管理员校验通过</strong><span class="muted"> API Key：${data.apiKeyConfigured ? "已配置" : "未配置"}　下载目录：${data.downloadDirectoryConfigured ? "已授权" : "未授权"}</span></div>${!data.apiKeyConfigured || !data.downloadDirectoryConfigured ? '<div class="warning">请先到飞牛应用设置完成配置。</div>' : ""}`;
  } catch (error) { $("#health").innerHTML = `<strong class="error">${escapeHtml(error.message)}</strong>`; }
}

function renderPreview(data) {
  const media = data.media;
  previewToken = data.previewToken;
  const image = media.thumbnail ? `<img class="cover" src="${escapeHtml(media.thumbnail)}" alt="封面" referrerpolicy="no-referrer">` : `<div class="cover placeholder">ZJJX</div>`;
  $("#preview").classList.remove("hidden");
  $("#preview").innerHTML = `${image}<div class="preview-body"><p class="eyebrow">${escapeHtml(data.parser)}</p><h2>${escapeHtml(media.title)}</h2><p class="muted">${escapeHtml(media.platform)}${media.author ? ` · ${escapeHtml(media.author)}` : ""} · ${media.mediaType === "images" ? `图片组，共 ${media.count} 张` : "视频"}</p>${media.mediaType === "images" ? `<div class="thumbs">${media.imageUrls.slice(0, 6).map((url) => `<img src="${escapeHtml(url)}" referrerpolicy="no-referrer">`).join("")}</div>` : ""}${downloadDirectoryConfigured ? "" : '<p class="warning">请先在飞牛应用设置中授权下载目录，完成授权后才能下载。</p>'}<div class="form-row"><button id="confirm-download" class="primary" ${downloadDirectoryConfigured ? "" : "disabled"}>确认下载</button><button id="cancel-preview" class="secondary">取消</button><span id="download-error" class="error"></span></div></div>`;
  $("#confirm-download").onclick = async () => {
    try { const result = await request("/api/downloads", { method: "POST", body: JSON.stringify({ previewToken }) }); previewToken = ""; $("#preview").innerHTML = `<div class="success"><strong>已加入下载队列</strong><p class="muted">任务 ${escapeHtml(result.task.id)} 正在后台处理。</p><button class="secondary" id="view-tasks">查看任务历史</button></div>`; $("#view-tasks").onclick = () => showPage("tasks"); } catch (error) { $("#download-error").textContent = error.message; }
  };
  $("#cancel-preview").onclick = () => { previewToken = ""; $("#preview").classList.add("hidden"); };
}

$("#resolve-form").onsubmit = async (event) => {
  event.preventDefault(); $("#resolve-error").textContent = "正在解析…";
  try { renderPreview(await request("/api/resolve", { method: "POST", body: JSON.stringify({ url: $("#source-url").value.trim() }) })); $("#resolve-error").textContent = ""; } catch (error) { $("#resolve-error").textContent = error.message; }
};

function taskStatus(status) { return ({ queued: "排队中", downloading: "下载中", succeeded: "已完成", failed: "失败", cancelled: "已取消" }[status] || status); }

async function loadTasks() {
  try {
    const data = await request("/api/tasks");
    $("#tasks").innerHTML = data.tasks.length ? data.tasks.map((task) => `<article class="task"><div class="task-main"><div><strong>${escapeHtml(task.title)}</strong><p class="muted">${escapeHtml(task.platform)} · ${escapeHtml(task.mediaType)} · ${new Date(task.createdAt).toLocaleString()}</p></div><span class="badge ${escapeHtml(task.status)}">${taskStatus(task.status)}</span></div><div class="progress"><i style="width:${task.progress?.total ? Math.min(100, task.progress.completed / task.progress.total * 100) : 0}%"></i></div><p class="muted">${task.progress?.completed || 0} / ${task.progress?.total || task.count}　${bytes(task.progress?.bytes)}${task.error ? `　<span class="error">${escapeHtml(task.error)}</span>` : ""}</p>${task.savedPaths?.length ? `<p class="path">${task.savedPaths.map(escapeHtml).join("<br>")}</p>` : ""}</article>`).join("") : '<div class="empty">还没有下载任务。</div>';
  } catch (error) { $("#tasks").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
}

$("#clear-tasks").onclick = async () => { if (!confirm("只清理应用内历史记录，不会删除已经下载的文件。继续吗？")) return; await request("/api/tasks", { method: "DELETE" }); loadTasks(); };
document.querySelectorAll(".nav").forEach((item) => { item.onclick = () => showPage(item.dataset.page); });
loadHealth();
setInterval(() => { if (!$("#page-tasks").classList.contains("hidden")) loadTasks(); }, 3000);
