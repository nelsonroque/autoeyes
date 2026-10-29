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
