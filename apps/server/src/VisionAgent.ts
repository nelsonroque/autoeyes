import { z } from "zod";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserController, CapturedScreenshot } from "./BrowserController.js";
import type { RunLogger } from "./RunLogger.js";

const actionSchema=z.object({observation:z.string(),action:z.enum(["click","move","keypress","type","wait","finish"]),x:z.number().nullable().optional(),y:z.number().nullable().optional(),key:z.string().nullable().optional(),text:z.string().nullable().optional(),durationMs:z.number().nullable().optional(),confidence:z.number().min(0).max(1),reason:z.string()});
export type VisionAction=z.infer<typeof actionSchema>;
export type VisionLimits={maxCalls:number;maxTokens:number;maxDurationMs:number;maxConsecutiveErrors:number};
export const defaultVisionLimits:VisionLimits={maxCalls:30,maxTokens:500000,maxDurationMs:300000,maxConsecutiveErrors:3};
export const visionLimitsInputSchema=z.object({maxCalls:z.number().int().positive().max(500),maxTokens:z.number().int().positive().max(10_000_000),maxDurationMs:z.number().int().positive().max(3_600_000),maxConsecutiveErrors:z.number().int().positive().max(20)}).partial();
export const visionScreenshotLimits={width:1024,height:768};
export function mapScreenshotPoint(x:number,y:number,screenshot:{width:number;height:number},viewport:{width:number;height:number}){return {x:x*viewport.width/screenshot.width,y:y*viewport.height/screenshot.height};}
export function visionLimitReason(calls:number,tokens:number,elapsedMs:number,limits:VisionLimits){if(calls>=limits.maxCalls)return `AI call limit reached (${calls}/${limits.maxCalls})`;if(tokens>=limits.maxTokens)return `AI token budget reached (${tokens.toLocaleString()}/${limits.maxTokens.toLocaleString()})`;if(elapsedMs>=limits.maxDurationMs)return `AI duration limit reached (${Math.round(elapsedMs/1000)}s/${Math.round(limits.maxDurationMs/1000)}s)`;return undefined;}
export class VisionAgent {
  paused=false;stopRequested=false;private currentProcess?:ChildProcessByStdio<null,Readable,Readable>;
  constructor(private browser:BrowserController,private logger:RunLogger){}
  pause(){this.paused=true;} resume(){this.paused=false;} stop(){this.stopRequested=true;this.currentProcess?.kill("SIGTERM");}
  async run(url:string,providedLimits:Partial<VisionLimits>={}){
    const limits={...defaultVisionLimits,...visionLimitsInputSchema.parse(providedLimits)};
    const run=this.logger.start(url,"ai");const started=Date.now();let calls=0,errors=0;
    let screenshot=await this.browser.fittedScreenshotBuffer(visionScreenshotLimits.width,visionScreenshotLimits.height);
    while(!this.stopRequested&&calls<limits.maxCalls&&Date.now()-started<limits.maxDurationMs&&run.tokenUsage.input+run.tokenUsage.output<limits.maxTokens){
      while(this.paused)await new Promise(r=>setTimeout(r,100));
      try{const action=await this.decide(screenshot,Math.max(1,limits.maxDurationMs-(Date.now()-started)));calls++;errors=0;const i=this.logger.action(action.action,action,Date.now()-started);this.logger.dispatch(i,started);await this.execute(action,screenshot);if(action.action!=="finish")screenshot=await this.browser.fittedScreenshotBuffer(visionScreenshotLimits.width,visionScreenshotLimits.height);const shot=await this.browser.saveScreenshot(screenshot.buffer,`ai-${run.id}-${i}`);this.logger.screenshot(shot);this.logger.success(i,started,shot);await this.logger.checkpoint();if(action.action==="finish"){await this.logger.finish("completed");return;}}
      catch(error){errors++;run.errors.push(error instanceof Error?error.message:String(error));if(errors>=limits.maxConsecutiveErrors){await this.logger.finish("failed");return;}}
    }if(this.stopRequested){await this.logger.finish("stopped");return;}const reason=visionLimitReason(calls,run.tokenUsage.input+run.tokenUsage.output,Date.now()-started,limits);if(reason)run.warnings.push(reason);await this.logger.finish("failed");
  }
  private async decide(screenshot:CapturedScreenshot,timeoutMs:number):Promise<VisionAction>{
    const temporary=await mkdtemp(path.join(os.tmpdir(),"cognitive-studio-codex-"));const imagePath=path.join(temporary,"screen.png"),schemaPath=path.join(temporary,"action.schema.json"),outputPath=path.join(temporary,"action.json");
    const schema={type:"object",additionalProperties:false,required:["observation","action","x","y","key","text","durationMs","confidence","reason"],properties:{observation:{type:"string"},action:{type:"string",enum:["click","move","keypress","type","wait","finish"]},x:{type:["number","null"]},y:{type:["number","null"]},key:{type:["string","null"]},text:{type:["string","null"]},durationMs:{type:["number","null"]},confidence:{type:"number",minimum:0,maximum:1},reason:{type:"string"}}};
    try{await writeFile(imagePath,screenshot.buffer);await writeFile(schemaPath,JSON.stringify(schema));
      const args=["exec","--ephemeral","--ignore-user-config","--ignore-rules","--skip-git-repo-check","--sandbox","read-only","--color","never","--json","-C",temporary,"--image",imagePath,"--output-schema",schemaPath,"--output-last-message",outputPath];if(process.env.CODEX_VISION_MODEL)args.push("--model",process.env.CODEX_VISION_MODEL);args.push("Inspect only the attached assessment screenshot. Do not use shell commands, tools, files, DOM data, accessibility data, or application internals. Return the single safest next visible-screen action. Coordinates are pixels in the attached screenshot. Use finish only when visible completion is clear.");
      await this.runCodex(args,timeoutMs);const text=await readFile(outputPath,"utf8");return actionSchema.parse(JSON.parse(text));
    }finally{await rm(temporary,{recursive:true,force:true});}
  }
  private runCodex(args:string[],timeoutMs:number){return new Promise<void>((resolve,reject)=>{const child=spawn(process.env.CODEX_BIN||"codex",args,{stdio:["ignore","pipe","pipe"],env:process.env});this.currentProcess=child;let stderr="",stdout="",settled=false;const fail=(error:Error)=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};const timer=setTimeout(()=>{child.kill("SIGTERM");fail(new Error("Codex vision call exceeded the remaining run duration"));},timeoutMs);child.stdout.on("data",chunk=>{stdout=(stdout+chunk.toString("utf8")).slice(-2_000_000);});child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString("utf8")).slice(-12000);});child.on("error",fail);child.on("close",code=>{this.currentProcess=undefined;if(settled)return;settled=true;clearTimeout(timer);if(code!==0){reject(new Error(`Codex vision process exited with code ${code}: ${stderr.trim()}`));return;}for(const line of stdout.split("\n")){try{const event=JSON.parse(line);const usage=event.usage??event.turn?.usage??event.item?.usage;if(usage&&this.logger.current){this.logger.current.tokenUsage.input+=usage.input_tokens??0;this.logger.current.tokenUsage.output+=usage.output_tokens??0;}}catch{}}resolve();});});}
  private async execute(a:VisionAction,screenshot:CapturedScreenshot){if(a.action==="click"){if(a.x==null||a.y==null)throw new Error("Click missing coordinates");const point=mapScreenshotPoint(a.x,a.y,screenshot,this.browser.viewport);await this.browser.click(point.x,point.y);}else if(a.action==="move"){if(a.x==null||a.y==null)throw new Error("Move missing coordinates");const point=mapScreenshotPoint(a.x,a.y,screenshot,this.browser.viewport);await this.browser.move(point.x,point.y);}else if(a.action==="keypress")await this.browser.keypress(a.key??"");else if(a.action==="type")await this.browser.type(a.text??"");else if(a.action==="wait")await new Promise(r=>setTimeout(r,a.durationMs??500));}
}
