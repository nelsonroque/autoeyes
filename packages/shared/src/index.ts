import { z } from "zod";

export const testingModeSchema = z.enum(["scripted", "ai", "simulated", "dom"]);
export type TestingMode = z.infer<typeof testingModeSchema>;

const baseStep = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  delayMs: z.number().int().nonnegative().default(0),
  timeoutMs: z.number().int().positive().optional(),
  onTimeout: z.enum(["fail", "continue", "recover"]).optional(),
  recoverySteps: z.array(z.unknown()).optional()
});

export const strategyStepSchema: z.ZodType<any> = z.lazy(() => z.discriminatedUnion("type", [
  baseStep.extend({ type: z.literal("click"), x: z.number().nonnegative(), y: z.number().nonnegative(), normalizedX: z.number().min(0).max(1).optional(), normalizedY: z.number().min(0).max(1).optional(), button: z.enum(["left", "right", "middle"]).default("left") }),
  baseStep.extend({ type: z.literal("move"), x: z.number().nonnegative(), y: z.number().nonnegative(), normalizedX: z.number().min(0).max(1).optional(), normalizedY: z.number().min(0).max(1).optional() }),
  baseStep.extend({ type: z.literal("keypress"), key: z.string().min(1) }),
  baseStep.extend({ type: z.literal("type"), text: z.string() }),
  baseStep.extend({ type: z.literal("wait"), durationMs: z.number().int().nonnegative() }),
  baseStep.extend({ type: z.literal("waitForVisualChange"), threshold: z.number().min(0).max(1).default(0.01), pollMs: z.number().int().positive().default(150) }),
  baseStep.extend({ type: z.literal("screenshot"), name: z.string().optional() }),
  baseStep.extend({ type: z.literal("loop"), count: z.number().int().nonnegative().optional(), while: z.object({ parameter: z.string(), equals: z.unknown() }).optional(), steps: z.array(strategyStepSchema) }),
  baseStep.extend({ type: z.literal("branch"), condition: z.object({ parameter: z.string(), equals: z.unknown() }), then: z.array(strategyStepSchema), else: z.array(strategyStepSchema).optional() }),
  baseStep.extend({ type: z.literal("domClick"), selector: z.string().min(1) }),
  baseStep.extend({ type: z.literal("domType"), selector: z.string().min(1), text: z.string() })
]));

export type StrategyStep = z.infer<typeof strategyStepSchema>;

export const strategySchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  version: z.number().int().positive().default(1),
  name: z.string().min(1),
  description: z.string().optional(),
  assessmentUrl: z.string().url(),
  mode: testingModeSchema,
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), deviceScaleFactor: z.number().positive().default(1) }),
  parameters: z.record(z.unknown()).default({}),
  metadata: z.object({ createdAt: z.string(), updatedAt: z.string(), tags: z.array(z.string()).default([]), learnedByAI: z.boolean().default(false), recordingScreenshots: z.array(z.string()).default([]) }),
  trialCounter: z.object({ parameter: z.string(), initial: z.number().int().default(0) }).optional(),
  steps: z.array(strategyStepSchema),
  completion: z.object({ maxDurationMs: z.number().int().positive().default(300000), maxActions: z.number().int().positive().default(1000) }).default({ maxDurationMs: 300000, maxActions: 1000 })
});

export type Strategy = z.infer<typeof strategySchema>;

export const participantConfigSchema = z.object({
  participantId: z.string().min(1), meanRT: z.number().positive(), sdRT: z.number().nonnegative(),
  accuracy: z.number().min(0).max(1), errorProbability: z.number().min(0).max(1).default(0),
  lapseProbability: z.number().min(0).max(1), fatigueSlope: z.number(), practiceSlope: z.number(), seed: z.number().int()
});
export type ParticipantConfig = z.infer<typeof participantConfigSchema>;

export interface ActionLog { index: number; type: string; plannedAtMs: number; dispatchedAtMs?: number; completedAtMs?: number; plannedDelayMs?: number; actualDelayMs?: number; status: "planned"|"running"|"success"|"failed"|"skipped"; detail?: unknown; error?: string; screenshot?: string; }
export interface ConsoleEntry { timestamp: string; elapsedMs: number; type: string; text: string; location?: { url: string; lineNumber?: number; columnNumber?: number }; }
export interface RunRecord { id: string; assessmentUrl: string; strategyId?: string; strategyVersion?: number; mode: TestingMode; simulated: boolean; startedAt: string; endedAt?: string; status: "running"|"paused"|"completed"|"failed"|"stopped"; actions: ActionLog[]; consoleMessages?: ConsoleEntry[]; screenshots: string[]; errors: string[]; warnings: string[]; tokenUsage: { input: number; output: number; estimatedCostUsd: number }; participant?: ParticipantConfig; }

export function validateStrategy(input: unknown): Strategy { return strategySchema.parse(input); }
