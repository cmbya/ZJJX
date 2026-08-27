import { loadConfig } from "./config.mjs";
import { parserEndpoint } from "./parser-api.mjs";
import { updateTask } from "./task-store.mjs";
import { downloadMedia } from "./downloader.mjs";
import { errorDetails, log } from "./logger.mjs";

export class DownloadQueue {
  #pending = [];
  #running = false;

  enqueue(task, media) {
    this.#pending.push({ task, media });
    this.#drain();
  }

  async #drain() {
    if (this.#running) return;
    const item = this.#pending.shift();
    if (!item) return;
    this.#running = true;
    const { task, media } = item;
    log("INFO", "download_start", { taskId: task.id, mediaType: media.mediaType, count: media.count, platform: media.platform });
    try {
      await updateTask(task.id, { status: "downloading", progress: { completed: 0, total: media.count, bytes: 0 } });
      const config = await loadConfig();
      const result = await downloadMedia(media, task.id, config, parserEndpoint(), async (progress) => updateTask(task.id, { progress }));
      await updateTask(task.id, { status: "succeeded", progress: { completed: media.count, total: media.count, bytes: result.bytes }, savedPaths: result.savedPaths, error: "" });
      log("INFO", "download_success", { taskId: task.id, bytes: result.bytes, files: result.savedPaths.length });
    } catch (error) {
      await updateTask(task.id, { status: "failed", error: error.message || "下载失败" });
      log("ERROR", "download_failed", { taskId: task.id, error: errorDetails(error) });
    } finally {
      this.#running = false;
      this.#drain();
    }
  }
}
