import type { Strategy, StrategyStep, TestingMode } from "@studio/shared";
import type { BrowserController } from "./BrowserController.js";
import type { RunLogger } from "./RunLogger.js";
import type { DOMAgent } from "./DOMAgent.js";

const sleep=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));
export class StrategyEngine {
  running=false; paused=false; currentStep=0; currentAction="idle"; private stopRequested=false; private stepCredits=0; private wake?:()=>void;
  constructor(private browser:BrowserController,private logger:RunLogger,private dom:DOMAgent){}
  pause(){if(this.running)this.paused=true;}
  resume(){this.paused=false;this.stepCredits=0;this.wake?.();}
  step(){this.paused=true;this.stepCredits++;this.wake?.();}
  stop(){this.stopRequested=true;this.wake?.();}
  private async gate(){while(this.paused&&this.stepCredits===0&&!this.stopRequested) await new Promise<void>((r)=>this.wake=r); if(this.stepCredits>0)this.stepCredits--;}
  private coords(step:any,strategy:Strategy){return {x:step.normalizedX!==undefined?step.normalizedX*this.browser.viewport.width:step.x*(this.browser.viewport.width/strategy.viewport.width),y:step.normalizedY!==undefined?step.normalizedY*this.browser.viewport.height:step.y*(this.browser.viewport.height/strategy.viewport.height)};}
  async run(strategy:Strategy, mode:TestingMode=strategy.mode){
    if(this.running)throw new Error("A strategy is already running");
    if(mode!=="dom"&&strategy.steps.some((s:StrategyStep)=>s.type==="domClick"||s.type==="domType"))throw new Error("DOM steps are forbidden outside DOM-driven mode");
    this.running=true;this.paused=false;this.stopRequested=false;this.currentStep=0;const started=Date.now();let plannedAt=0;
    this.logger.start(strategy.assessmentUrl,mode,strategy,mode==="simulated");
    try{await this.executeSteps(strategy.steps,strategy,mode,started,()=>plannedAt,(v)=>plannedAt=v);await this.logger.finish(this.stopRequested?"stopped":"completed");}
    catch(error){this.logger.current?.errors.push(error instanceof Error?error.message:String(error));await this.logger.finish("failed");throw error;}
    finally{this.running=false;this.paused=false;this.currentAction="idle";}
  }
  private async executeSteps(steps:StrategyStep[],strategy:Strategy,mode:TestingMode,started:number,getPlanned:()=>number,setPlanned:(v:number)=>void){
    for(const step of steps){
      if(this.stopRequested)break;if(Date.now()-started>strategy.completion.maxDurationMs)throw new Error("Strategy exceeded maximum duration");if((this.logger.current?.actions.length??0)>=strategy.completion.maxActions)throw new Error("Strategy exceeded maximum actions");
      await this.gate();if(this.stopRequested)break;this.currentStep++;this.currentAction=step.type;
      if(step.type==="loop"){const count=step.count??0;for(let i=0;i<count&&!this.stopRequested;i++)await this.executeSteps(step.steps,strategy,mode,started,getPlanned,setPlanned);continue;}
      if(step.type==="branch"){const actual=strategy.parameters[step.condition.parameter];await this.executeSteps(actual===step.condition.equals?step.then:(step.else??[]),strategy,mode,started,getPlanned,setPlanned);continue;}
      const delay=step.delayMs??0;setPlanned(getPlanned()+delay);const index=this.logger.action(step.type,step,getPlanned(),delay);if(delay)await sleep(delay);this.logger.dispatch(index,started);
      try{
        if(step.type==="click"){const p=this.coords(step,strategy);await this.browser.click(p.x,p.y,step.button);}
        else if(step.type==="move"){const p=this.coords(step,strategy);await this.browser.move(p.x,p.y);}
        else if(step.type==="keypress")await this.browser.keypress(step.key);
        else if(step.type==="type")await this.browser.type(step.text);
        else if(step.type==="wait")await sleep(step.durationMs);
        else if(step.type==="screenshot"){const file=await this.browser.screenshot(step.name??"strategy");this.logger.screenshot(file);}
        else if(step.type==="waitForVisualChange")await this.waitForVisualChange(step.timeoutMs??5000,step.pollMs);
        else if(step.type==="domClick"){if(mode!=="dom")throw new Error("DOM boundary violation");await this.dom.click(step.selector);}
        else if(step.type==="domType"){if(mode!=="dom")throw new Error("DOM boundary violation");await this.dom.type(step.selector,step.text);}
        const shot=await this.browser.screenshot(`run-${this.logger.current?.id}-step-${index}`);this.logger.screenshot(shot);this.logger.success(index,started,shot);await this.logger.checkpoint();
      }catch(error){this.logger.failure(index,error);if(step.onTimeout==="continue")continue;if(step.onTimeout==="recover"&&step.recoverySteps){await this.executeSteps(step.recoverySteps as StrategyStep[],strategy,mode,started,getPlanned,setPlanned);continue;}throw error;}
    }
  }
  private async waitForVisualChange(timeout:number,poll:number){const first=await this.browser.screenshotBuffer();const end=Date.now()+timeout;while(Date.now()<end){await sleep(poll);const next=await this.browser.screenshotBuffer();if(!first.equals(next))return;}throw new Error(`No visual change within ${timeout}ms`);}
  get state(){return {running:this.running,paused:this.paused,currentStep:this.currentStep,currentAction:this.currentAction};}
}
