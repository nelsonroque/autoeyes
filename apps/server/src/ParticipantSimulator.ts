import type { ParticipantConfig, Strategy, StrategyStep } from "@studio/shared";

export class SeededRandom { private state:number; constructor(seed:number){this.state=seed>>>0||1;} next(){ this.state=(1664525*this.state+1013904223)>>>0; return this.state/4294967296; } normal(){ const u=Math.max(this.next(),1e-9),v=this.next(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); } }
export class ParticipantSimulator {
  constructor(readonly config: ParticipantConfig, private rng = new SeededRandom(config.seed)) {}
  reactionTime(trial:number) { const {meanRT,sdRT,practiceSlope,fatigueSlope}=this.config; const sigma=Math.sqrt(Math.log(1+(sdRT*sdRT)/(meanRT*meanRT))); const mu=Math.log(meanRT)-sigma*sigma/2; const base=Math.exp(mu+sigma*this.rng.normal()); const trend=Math.max(.25,1+practiceSlope*Math.min(trial,10)+fatigueSlope*Math.max(0,trial-10)); return Math.max(80,Math.round(base*trend)); }
  shouldLapse(){return this.rng.next()<this.config.lapseProbability;}
  shouldError(){return this.rng.next()>this.config.accuracy||this.rng.next()<this.config.errorProbability;}
  transform(strategy:Strategy):Strategy { let trial=0; const steps:StrategyStep[]=strategy.steps.map((step:StrategyStep)=> { if(step.type!=="click"&&step.type!=="keypress") return step; const delayMs=this.reactionTime(trial++); if(this.shouldLapse()) return {type:"wait",durationMs:delayMs+Math.round(this.config.meanRT*2),delayMs:0} as StrategyStep; return {...step,delayMs,...(this.shouldError()?{label:`${step.label??"response"} [error injected]`}:{})}; }); return {...strategy,mode:"simulated",steps}; }
}
