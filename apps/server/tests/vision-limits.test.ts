import test from "node:test";
import assert from "node:assert/strict";
import { defaultVisionLimits, mapScreenshotPoint, visionLimitReason, visionLimitsInputSchema } from "../src/VisionAgent.js";

test("reports the token limit that ended an AI run",()=>{
  assert.equal(
    visionLimitReason(3,42_654,22_000,{...defaultVisionLimits,maxTokens:30_000}),
    "AI token budget reached (42,654/30,000)",
  );
});

test("the revised default budget permits the observed three-call usage",()=>{
  assert.equal(visionLimitReason(3,42_654,22_000,defaultVisionLimits),undefined);
});

test("reports call and duration limits",()=>{
  assert.equal(visionLimitReason(30,1_000,10_000,defaultVisionLimits),"AI call limit reached (30/30)");
  assert.equal(visionLimitReason(1,1_000,300_000,defaultVisionLimits),"AI duration limit reached (300s/300s)");
});

test("rejects invalid AI limits",()=>{
  assert.throws(()=>visionLimitsInputSchema.parse({maxTokens:0}));
  assert.deepEqual(visionLimitsInputSchema.parse({maxCalls:40}),{maxCalls:40});
});

test("maps resized screenshot coordinates back to the browser viewport",()=>{
  assert.deepEqual(mapScreenshotPoint(512,320,{width:1024,height:640},{width:1280,height:800}),{x:640,y:400});
});
