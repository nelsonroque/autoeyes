import { describe,it } from "node:test";import assert from "node:assert/strict";
import { validateStrategy } from "@studio/shared";

const valid={schemaVersion:"1.0",id:"test",version:1,name:"Test",assessmentUrl:"https://example.com",mode:"scripted",viewport:{width:1000,height:800,deviceScaleFactor:1},parameters:{answer:true},metadata:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),tags:[],learnedByAI:false,recordingScreenshots:[]},steps:[{type:"click",x:500,y:400,normalizedX:.5,normalizedY:.5,button:"left",delayMs:20}],completion:{maxDurationMs:1000,maxActions:10}};
describe("strategy validation",()=>{it("accepts a coordinate-only strategy",()=>assert.equal(validateStrategy(valid).steps.length,1));it("rejects invalid normalized coordinates",()=>assert.throws(()=>validateStrategy({...valid,steps:[{...valid.steps[0],normalizedX:2}]})));it("rejects unversioned input",()=>assert.throws(()=>validateStrategy({...valid,schemaVersion:"2.0"})));});
