import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getVarDir } from "./config.mjs";

function tasksFile() { return path.join(getVarDir(), "tasks.json"); }

let storeQueue = Promise.resolve();

function serialize(operation) {
  const result = storeQueue.then(operation, operation);
  storeQueue = result.catch(() => {});
  return result;
}

async function readTasks() {
  try {
    const tasks = JSON.parse(await fs.readFile(tasksFile(), "utf8"));
    return Array.isArray(tasks) ? tasks : [];
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function persist(tasks) {
  const file = tasksFile();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
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
  await storeQueue;
  return readTasks();
}

export async function initTaskStore() {
  return serialize(async () => {
    const tasks = await readTasks();
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
  });
}

export async function createTask(media, user) {
  return serialize(async () => {
    const tasks = await readTasks();
    const task = {
      id: crypto.randomBytes(8).toString("hex"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: user.uid,
      platform: media.platform,
      author: media.author,
      username: media.username || media.author,
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
  });
}

export async function updateTask(id, patch) {
  return serialize(async () => {
    const tasks = await readTasks();
    const task = tasks.find((item) => item.id === id);
    if (!task) return null;
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    await persist(tasks);
    return task;
  });
}

export async function listTasks(user) {
  await storeQueue;
  return (await readTasks()).filter((task) => task.userId === user.uid);
}

export async function getTask(id, user) {
  await storeQueue;
  return (await readTasks()).find((task) => task.id === id && task.userId === user.uid) || null;
}

export async function clearTasks(user) {
  return serialize(async () => {
    const tasks = await readTasks();
    await persist(tasks.filter((task) => task.userId !== user.uid));
  });
}
