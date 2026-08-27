import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getVarDir } from "./config.mjs";

function tasksFile() { return path.join(getVarDir(), "tasks.json"); }

async function persist(tasks) {
  const file = tasksFile();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  const handle = await fs.open(temporary, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(tasks, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, file);
}

export async function loadTasks() {
  try {
    const tasks = JSON.parse(await fs.readFile(tasksFile(), "utf8"));
    return Array.isArray(tasks) ? tasks : [];
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

export async function initTaskStore() {
  const tasks = await loadTasks();
  let changed = false;
  for (const task of tasks) {
    if (["queued", "downloading"].includes(task.status)) {
      task.status = "failed";
      task.error = "服务重启导致任务中断";
      task.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) await persist(tasks);
  return tasks;
}

export async function createTask(media, user) {
  const tasks = await loadTasks();
  const task = {
    id: crypto.randomBytes(8).toString("hex"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: user.uid,
    platform: media.platform,
    author: media.author,
    title: media.title,
    mediaType: media.mediaType,
    count: media.count,
    status: "queued",
    progress: { completed: 0, total: media.count, bytes: 0 },
    savedPaths: [],
    error: ""
  };
  tasks.unshift(task);
  await persist(tasks);
  return task;
}

export async function updateTask(id, patch) {
  const tasks = await loadTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) return null;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  await persist(tasks);
  return task;
}

export async function listTasks(user) {
  return (await loadTasks()).filter((task) => task.userId === user.uid);
}

export async function getTask(id, user) {
  return (await loadTasks()).find((task) => task.id === id && task.userId === user.uid) || null;
}

export async function clearTasks(user) {
  const tasks = await loadTasks();
  await persist(tasks.filter((task) => task.userId !== user.uid));
}
