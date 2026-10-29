import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RunLogger } from "../src/RunLogger.js";

describe("run console capture", () => {
  it("keeps messages only during the current run and bounds capture", () => {
    const logger = new RunLogger();
    const message = { type: "log", text: "response", location: { url: "https://example.com/task", lineNumber: 2, columnNumber: 1 } };
    logger.console(message);
    const run = logger.start("https://example.com", "scripted");
    logger.console(message);
    assert.equal(run.consoleMessages?.length, 1);
    assert.equal(run.consoleMessages?.[0].text, "response");
    assert.equal(run.consoleMessages?.[0].location?.lineNumber, 2);
    assert.ok(run.consoleMessages![0].elapsedMs >= 0);
    for (let i = 0; i < 1001; i++) logger.console({ type: "warning", text: "x".repeat(10001) });
    assert.equal(run.consoleMessages?.length, 1000);
    assert.equal(run.consoleMessages?.[1].text.length, 10000);
    assert.equal(run.warnings.filter(w => w.includes("Console capture limit")).length, 1);
    run.status = "completed";
    logger.console(message);
    assert.equal(run.consoleMessages?.length, 1000);
    assert.equal(logger.start("https://example.com", "scripted").consoleMessages?.length, 0);
  });
});
