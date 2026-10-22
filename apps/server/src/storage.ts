import { mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { RunRecord, Strategy } from "@studio/shared";
import { validateStrategy } from "@studio/shared";

const workspace = path.resolve(process.cwd(), process.cwd().endsWith("apps/server") ? "../.." : ".");
export const dataDir = process.env.STUDIO_DATA_DIR ? path.resolve(process.env.STUDIO_DATA_DIR) : path.join(workspace, "data");
export const strategyDir = path.join(dataDir, "strategies");
export const runDir = path.join(dataDir, "runs");
export const screenshotDir = path.join(dataDir, "screenshots");

export async function ensureStorage() { await Promise.all([strategyDir, runDir, screenshotDir].map((dir) => mkdir(dir, { recursive: true }))); }
const safe = (id: string) => id.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function listStrategies(): Promise<Strategy[]> {
  await ensureStorage();
  const files = (await readdir(strategyDir)).filter((f) => f.endsWith(".json"));
  const values = await Promise.all(files.map(async (file) => validateStrategy(JSON.parse(await readFile(path.join(strategyDir, file), "utf8")))));
  return values.sort((a, b) => b.metadata.updatedAt.localeCompare(a.metadata.updatedAt));
}
export async function getStrategy(id: string): Promise<Strategy> { return validateStrategy(JSON.parse(await readFile(path.join(strategyDir, `${safe(id)}.json`), "utf8"))); }
export async function saveStrategy(value: unknown): Promise<Strategy> {
  await ensureStorage(); const strategy = validateStrategy(value);
  await writeFile(path.join(strategyDir, `${safe(strategy.id)}.json`), JSON.stringify(strategy, null, 2)); return strategy;
}
export async function deleteStrategy(id: string) { await rm(path.join(strategyDir, `${safe(id)}.json`)); }
export async function saveRun(run: RunRecord) { await ensureStorage(); await writeFile(path.join(runDir, `${safe(run.id)}.json`), JSON.stringify(run, null, 2)); }
export async function listRuns(): Promise<RunRecord[]> {
  await ensureStorage(); const files = (await readdir(runDir)).filter((f) => f.endsWith(".json"));
  const runs = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(runDir, f), "utf8")) as RunRecord));
  return runs.sort((a,b) => b.startedAt.localeCompare(a.startedAt));
}
