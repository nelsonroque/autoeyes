import crypto from "node:crypto";
import type { RunRecord, Strategy, TestingMode } from "@studio/shared";
import { saveRun } from "./storage.js";

export class RunLogger {
  current?: RunRecord;
  private previousDispatchMs=0;
  start(url: string, mode: TestingMode, strategy?: Strategy, simulated = false): RunRecord {
    this.previousDispatchMs=0; this.current = { id: crypto.randomUUID(), assessmentUrl: url, strategyId: strategy?.id, strategyVersion: strategy?.version, mode, simulated, startedAt: new Date().toISOString(), status: "running", actions: [], screenshots: [], errors: [], warnings: simulated ? ["Synthetic run: not real participant data and not empirically calibrated."] : [], tokenUsage: { input: 0, output: 0, estimatedCostUsd: 0 } };
    return this.current;
  }
  action(type: string, detail: unknown, plannedAtMs: number, plannedDelayMs = 0) {
    if (!this.current) return -1;
    return this.current.actions.push({ index: this.current.actions.length, type, detail, plannedAtMs, plannedDelayMs, status: "planned" }) - 1;
  }
  dispatch(index: number, started: number) { const a = this.current?.actions[index]; if (a) { a.status = "running"; a.dispatchedAtMs = Date.now() - started; a.actualDelayMs = Math.max(0, a.dispatchedAtMs - this.previousDispatchMs); this.previousDispatchMs=a.dispatchedAtMs; } }
  success(index: number, started: number, screenshot?: string) { const a = this.current?.actions[index]; if (a) { a.status = "success"; a.completedAtMs = Date.now() - started; a.screenshot = screenshot; } }
  failure(index: number, error: unknown) { const message = error instanceof Error ? error.message : String(error); const a = this.current?.actions[index]; if (a) { a.status = "failed"; a.error = message; } this.current?.errors.push(message); }
  screenshot(path: string) { this.current?.screenshots.push(path); }
  async finish(status: RunRecord["status"]) { if (!this.current) return; this.current.status = status; this.current.endedAt = new Date().toISOString(); await saveRun(this.current); }
  async checkpoint() { if (this.current) await saveRun(this.current); }
}
