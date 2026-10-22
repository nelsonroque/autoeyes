import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { participantConfigSchema, testingModeSchema, validateStrategy, type Strategy, type TestingMode } from "@studio/shared";
import { BrowserController } from "./BrowserController.js";
import { Recorder } from "./Recorder.js";
import { RunLogger } from "./RunLogger.js";
import { DOMAgent } from "./DOMAgent.js";
import { StrategyEngine } from "./StrategyEngine.js";
import { VisionAgent, visionLimitsInputSchema } from "./VisionAgent.js";
import { ParticipantSimulator } from "./ParticipantSimulator.js";
import { deleteStrategy, getStrategy, listRuns, listStrategies, saveStrategy } from "./storage.js";
import { mockAssessmentHtml } from "./mockAssessment.js";
import { CodexAuthService } from "./CodexAuthService.js";

export function createStudio() {
  const app=express();app.use(cors({origin:process.env.WEB_ORIGIN??true}));app.use(express.json({limit:"15mb"}));
  const browser=new BrowserController();const logger=new RunLogger();const dom=new DOMAgent(browser);const engine=new StrategyEngine(browser,logger,dom);const vision=new VisionAgent(browser,logger);
  const codexAuth=new CodexAuthService();
  let activeMode:TestingMode="scripted";
  const recorder=new Recorder(()=>browser.viewport,()=>browser.screenshot("recording"));browser.setInputHandler((event)=>recorder.receive(event));
  const asyncRoute=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res,next)).catch(next);

  app.get("/api/health",(_req,res)=>res.json({ok:true}));
  app.get("/api/auth/codex",asyncRoute(async(_req:any,res:any)=>res.json(await codexAuth.status())));
  app.post("/api/auth/codex/device",asyncRoute(async(_req:any,res:any)=>{codexAuth.startDeviceLogin();res.status(202).json(await codexAuth.status());}));
  app.post("/api/auth/codex/cancel",asyncRoute(async(_req:any,res:any)=>{codexAuth.cancel();res.json(await codexAuth.status());}));
  app.get("/mock-assessment",(_req,res)=>res.type("html").send(mockAssessmentHtml));
  app.get("/api/state",(_req,res)=>res.json({browser:browser.status,activeMode,recording:{active:recorder.active,actions:recorder.count},execution:engine.state,run:logger.current}));
  app.post("/api/mode",(req,res)=>{activeMode=testingModeSchema.parse(req.body.mode);res.json({activeMode});});
  app.get("/api/screenshot",asyncRoute(async(_req:any,res:any)=>res.json({dataUrl:browser.page?await browser.currentScreenshotDataUrl():null})));
  app.post("/api/browser/launch",asyncRoute(async(req:any,res:any)=>{await browser.launch(req.body.url,req.body.viewport??{width:1280,height:800},req.body.headless);res.json(browser.status);}));
  app.post("/api/browser/stop",asyncRoute(async(_req:any,res:any)=>{engine.stop();vision.stop();await browser.stop();res.json({ok:true});}));
  app.post("/api/browser/restart",asyncRoute(async(_req:any,res:any)=>{engine.stop();await browser.restart();res.json(browser.status);}));
  app.post("/api/browser/reset",asyncRoute(async(_req:any,res:any)=>{await browser.reset();res.json(browser.status);}));
  app.post("/api/browser/input",asyncRoute(async(req:any,res:any)=>{if(req.body.action==="click")await browser.click(req.body.x,req.body.y,req.body.button);else if(req.body.action==="move")await browser.move(req.body.x,req.body.y);else if(req.body.action==="keypress")await browser.keypress(req.body.key);else if(req.body.action==="type")await browser.type(req.body.text);else throw new Error("Unsupported screen input action");res.json({ok:true});}));

  app.post("/api/record/start",(req,res)=>{if(!browser.page)return res.status(409).json({error:"Launch an assessment first"});recorder.start();res.json({ok:true});});
  app.post("/api/record/stop",asyncRoute(async(req:any,res:any)=>{if(!recorder.active)return res.status(409).json({error:"Recorder is not active"});const strategy=await recorder.stop(req.body.name||"Recorded strategy",browser.url!);await saveStrategy(strategy);res.json(strategy);}));

  app.get("/api/strategies",asyncRoute(async(_req:any,res:any)=>res.json(await listStrategies())));
  app.post("/api/strategies",asyncRoute(async(req:any,res:any)=>res.status(201).json(await saveStrategy(req.body))));
  app.put("/api/strategies/:id",asyncRoute(async(req:any,res:any)=>{const prior=await getStrategy(req.params.id);const next=validateStrategy({...prior,...req.body,id:prior.id,metadata:{...prior.metadata,...req.body.metadata,updatedAt:new Date().toISOString()}});res.json(await saveStrategy(next));}));
  app.post("/api/strategies/:id/duplicate",asyncRoute(async(req:any,res:any)=>{const s=await getStrategy(req.params.id);const now=new Date().toISOString();res.status(201).json(await saveStrategy({...s,id:`${s.id}-copy-${Date.now()}`,name:`${s.name} Copy`,version:1,metadata:{...s.metadata,createdAt:now,updatedAt:now}}));}));
  app.post("/api/strategies/:id/version",asyncRoute(async(req:any,res:any)=>{const s=await getStrategy(req.params.id);const now=new Date().toISOString();res.status(201).json(await saveStrategy({...s,id:`${s.id}-v${s.version+1}`,version:s.version+1,name:req.body.name??s.name,metadata:{...s.metadata,createdAt:now,updatedAt:now}}));}));
  app.delete("/api/strategies/:id",asyncRoute(async(req:any,res:any)=>{await deleteStrategy(req.params.id);res.status(204).end();}));
  app.get("/api/strategies/:id/export",asyncRoute(async(req:any,res:any)=>{const s=await getStrategy(req.params.id);res.attachment(`${s.id}.json`).json(s);}));

  app.post("/api/replay/:id",asyncRoute(async(req:any,res:any)=>{let strategy=await getStrategy(req.params.id);const mode=(req.body.mode??strategy.mode) as TestingMode;activeMode=mode;if(mode==="simulated"){const config=participantConfigSchema.parse(req.body.participant);strategy=new ParticipantSimulator(config).transform(strategy);}
    void engine.run(strategy,mode).catch(()=>{});res.status(202).json({started:true});}));
  app.post("/api/execution/pause",(_req,res)=>{engine.pause();vision.pause();res.json({ok:true});});
  app.post("/api/execution/resume",(_req,res)=>{engine.resume();vision.resume();res.json({ok:true});});
  app.post("/api/execution/step",(_req,res)=>{engine.step();res.json({ok:true});});
  app.post("/api/execution/stop",(_req,res)=>{engine.stop();vision.stop();res.json({ok:true});});
  app.post("/api/ai/start",asyncRoute(async(req:any,res:any)=>{if(!browser.url)throw new Error("Launch an assessment first");const auth=await codexAuth.status();if(!auth.authenticated)throw new Error("Sign in to Codex before starting an AI run");const limits=visionLimitsInputSchema.parse(req.body.limits??{});activeMode="ai";vision.stopRequested=false;void vision.run(browser.url,limits).catch(()=>{});res.status(202).json({started:true});}));
  app.get("/api/dom/discover",asyncRoute(async(_req:any,res:any)=>{if(activeMode!=="dom")return res.status(403).json({error:"DOM inspection is available only in DOM-driven mode"});res.json(await dom.discover());}));
  app.post("/api/dom/action",asyncRoute(async(req:any,res:any)=>{if(activeMode!=="dom")return res.status(403).json({error:"DOM actions are available only in DOM-driven mode"});if(req.body.action==="click")await dom.click(req.body.selector);else if(req.body.action==="type")await dom.type(req.body.selector,req.body.text);else throw new Error("Unsupported DOM action");res.json({ok:true});}));
  app.get("/api/runs",asyncRoute(async(_req:any,res:any)=>res.json(await listRuns())));
  app.get("/api/runs/:id/export",asyncRoute(async(req:any,res:any)=>{const run=(await listRuns()).find(r=>r.id===req.params.id);if(!run)return res.status(404).json({error:"Run not found"});res.attachment(`${run.id}.json`).json(run);}));

  const webDist=path.resolve(process.cwd(),process.cwd().endsWith("apps/server")?"../web/dist":"apps/web/dist");if(existsSync(webDist)){app.use(express.static(webDist));app.get("*",(_req,res)=>res.sendFile(path.join(webDist,"index.html")));}
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error?.name==="ZodError"?400:500).json({error:error instanceof Error?error.message:String(error),issues:error?.issues}));
  return {app,browser,engine,recorder,logger};
}
