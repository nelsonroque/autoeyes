import { it } from "node:test";
import assert from "node:assert/strict";
import { numericConsoleSeries } from "../../web/src/runCharts.js";

it("extracts only numeric fields from complete JSON messages in order", () => {
  const run: any = { consoleMessages: [
    { text: '{"trial":{"rt":120,"correct":true},"score":2}' },
    { text: '  newData: {"response_time_duration_ms":533.3}' },
    { text: '  newData: {"response_time_duration_ms":444.8}' },
    { text: 'debug score 999' },
    { text: '{"trial":{"rt":130},"results":[{"score":3},{"score":4}]}' },
    { text: '{"score":' }
  ] };
  assert.deepEqual(numericConsoleSeries(run), { "trial.rt": [120, 130], score: [2], response_time_duration_ms: [533.3, 444.8], "results.score": [3, 4] });
  assert.deepEqual(numericConsoleSeries({} as any), {});
});

it("uses shared histogram bins and includes the maximum once", async () => {
  const { histogramEdges, histogramCounts } = await import("../../web/src/runCharts.js");
  const edges = histogramEdges([0, 1, 2, 3, 4], 2);
  assert.deepEqual(edges, [0, 2, 4]);
  assert.deepEqual(histogramCounts([0, 1, 2, 3, 4], edges), [2, 3]);
  assert.deepEqual(histogramCounts([2, 4], edges), [0, 2]);
  assert.deepEqual(histogramCounts([7, 7], histogramEdges([7, 7])), [2]);
  assert.deepEqual(histogramEdges([]), []);
});

it("computes comparable normalized density curves and omits sparse sessions", async () => {
  const { densityCurves } = await import("../../web/src/runCharts.js");
  const result = densityCurves([[1, 2, 3], [2, 3, 4], [5]]);
  assert.ok(result);
  assert.equal(result.curves[2].length, 0);
  for (const curve of result.curves.slice(0, 2)) {
    const area = curve.reduce((sum, v) => sum + v, 0) * (result.x[1] - result.x[0]);
    assert.ok(Math.abs(area - 1) < 0.01);
  }
  assert.equal(densityCurves([[1], [2]]), null);
  assert.equal(densityCurves([[1, 1]]), null);
});
