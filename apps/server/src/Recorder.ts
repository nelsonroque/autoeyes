import crypto from "node:crypto";
import type { Strategy, StrategyStep, TestingMode } from "@studio/shared";

export type RawInputEvent = { kind: "click"|"keydown"; x?: number; y?: number; button?: number; key?: string; repeat?: boolean; time: number };

export class Recorder {
  active = false; private startedAt = 0; private lastAt = 0; private steps: StrategyStep[] = []; private screenshots:string[]=[]; private pending=new Set<Promise<void>>();
  constructor(private readonly viewport: () => {width:number;height:number}, private readonly onTransition: () => Promise<string>) {}
  start() { this.active = true; this.steps = []; this.screenshots=[]; this.pending.clear(); this.startedAt = this.lastAt = Date.now(); }
  private capture(){const work=this.onTransition().then(file=>{this.screenshots.push(file);});this.pending.add(work);void work.finally(()=>this.pending.delete(work));}
  async receive(event: RawInputEvent) {
    if (!this.active || event.repeat) return;
    const now = Date.now(); const delayMs = Math.max(0, now - this.lastAt); this.lastAt = now;
    const viewport = this.viewport();
    if (event.kind === "click" && event.x !== undefined && event.y !== undefined) {
      this.steps.push({ type: "click", x: event.x, y: event.y, normalizedX: event.x / viewport.width, normalizedY: event.y / viewport.height, button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left", delayMs });
      this.capture();
    } else if (event.kind === "keydown" && event.key) {
      this.steps.push({ type: "keypress", key: event.key, delayMs });
      if (event.key === "Enter" || event.key === " ") this.capture();
    }
  }
  async stop(name: string, assessmentUrl: string, mode: TestingMode = "scripted"): Promise<Strategy> {
    this.active = false; await Promise.all(this.pending); const now = new Date().toISOString();
    return { schemaVersion: "1.0", id: `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recording"}-${crypto.randomUUID().slice(0,8)}`, version: 1, name, assessmentUrl, mode, viewport: { ...this.viewport(), deviceScaleFactor: 1 }, parameters: {}, metadata: { createdAt: now, updatedAt: now, tags: ["recorded"], learnedByAI: false, recordingScreenshots:this.screenshots }, steps: this.steps, completion: { maxDurationMs: 300000, maxActions: 1000 } };
  }
  get count() { return this.steps.length; }
}
