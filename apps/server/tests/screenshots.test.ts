import test from "node:test";
import assert from "node:assert/strict";
import { fittedScreenshotSize } from "../src/BrowserController.js";

test("fits a desktop screenshot while preserving its aspect ratio",()=>{
  assert.deepEqual(fittedScreenshotSize({width:1280,height:800},1024,768),{width:1024,height:640,scale:.8});
});

test("does not enlarge screenshots that already fit",()=>{
  assert.deepEqual(fittedScreenshotSize({width:800,height:600},1024,768),{width:800,height:600,scale:1});
});

test("uses the tighter height constraint for tall screenshots",()=>{
  assert.deepEqual(fittedScreenshotSize({width:1000,height:2000},1024,768),{width:384,height:768,scale:.384});
});
