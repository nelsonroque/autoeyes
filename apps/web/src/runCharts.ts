import type { RunRecord } from "@studio/shared";

// Parse complete JSON messages or a labeled JSON payload; do not infer numbers from diagnostic text.
export function numericConsoleSeries(run: RunRecord): Record<string, number[]> {
  const series: Record<string, number[]> = {};
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 8) return;
    if (typeof value === "number" && Number.isFinite(value)) {
      (series[path || "value"] ??= []).push(value);
    } else if (Array.isArray(value)) {
      for (const child of value) visit(child, path, depth + 1);
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  for (const message of run.consoleMessages ?? []) {
    const text = message.text.trim();
    const labeled = text.match(/^[\w .-]+:\s*(?=[{\[])/);
    try { visit(JSON.parse(labeled ? text.slice(labeled[0].length) : text), "", 0); } catch { /* Ignore incomplete or non-JSON messages. */ }
  }
  return series;
}

export function histogramEdges(values: number[], binCount = 10): number[] {
  if (!values.length) return [];
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) return [min - 0.5, max + 0.5];
  return Array.from({ length: binCount + 1 }, (_, i) => min + (max - min) * i / binCount);
}

export function histogramCounts(values: number[], edges: number[]): number[] {
  if (edges.length < 2) return [];
  const counts = Array(edges.length - 1).fill(0) as number[];
  for (const value of values) {
    if (value < edges[0] || value > edges[edges.length - 1]) continue;
    const index = Math.min(counts.length - 1, Math.floor((value - edges[0]) / (edges[edges.length - 1] - edges[0]) * counts.length));
    counts[index]++;
  }
  return counts;
}

// Shared Gaussian bandwidth and domain make session curves directly comparable.
export function densityCurves(groups: number[][]): { x: number[]; curves: number[][]; bandwidth: number } | null {
  const eligible = groups.filter(group => group.length >= 2);
  const pooled = eligible.flat();
  if (pooled.length < 2) return null;
  const mean = pooled.reduce((sum, value) => sum + value, 0) / pooled.length;
  const sd = Math.sqrt(pooled.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (pooled.length - 1));
  if (!Number.isFinite(sd) || sd === 0) return null;
  const bandwidth = 1.06 * sd * pooled.length ** (-0.2);
  const min = Math.min(...pooled) - 3 * bandwidth, max = Math.max(...pooled) + 3 * bandwidth;
  const x = Array.from({length: 101}, (_, i) => min + (max - min) * i / 100);
  const curves = groups.map(group => group.length < 2 ? [] : x.map(point => group.reduce((sum, value) => sum + Math.exp(-0.5 * ((point - value) / bandwidth) ** 2), 0) / (group.length * bandwidth * Math.sqrt(2 * Math.PI))));
  return { x, curves, bandwidth };
}
