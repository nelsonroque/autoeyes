import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { promisify } from "node:util";

const execFileAsync=promisify(execFile);
export type CodexAuthState={installed:boolean;authenticated:boolean;method?:string;loginRunning:boolean;deviceInstructions?:string;error?:string};

export function parseCodexLoginStatus(output:string){
  const normalized=output.trim();
  const authenticated=/logged in/i.test(normalized)&&!/not logged in/i.test(normalized);
  const method=normalized.match(/logged in using\s+(.+)/i)?.[1]?.trim();
  return {authenticated,method};
}

export class CodexAuthService {
  private loginProcess?:ChildProcessByStdio<null,Readable,Readable>;private output="";private error?:string;
  readonly binary=process.env.CODEX_BIN||"codex";
  async status():Promise<CodexAuthState>{
    try{const {stdout,stderr}=await execFileAsync(this.binary,["login","status"],{timeout:5000});const parsed=parseCodexLoginStatus(`${stdout}\n${stderr}`);return {installed:true,...parsed,loginRunning:Boolean(this.loginProcess),deviceInstructions:this.loginProcess?this.output.trim()||undefined:undefined,error:this.error};}
    catch(error:any){const missing=error?.code==="ENOENT";return {installed:!missing,authenticated:false,loginRunning:Boolean(this.loginProcess),deviceInstructions:this.loginProcess?this.output.trim()||undefined:undefined,error:missing?"Codex CLI is not installed or is not on PATH":this.error||String(error?.stderr||error?.message||error)};}
  }
  startDeviceLogin(){
    if(this.loginProcess)return;this.output="";this.error=undefined;
    const child=spawn(this.binary,["login","--device-auth"],{stdio:["ignore","pipe","pipe"],env:process.env});this.loginProcess=child;
    const collect=(chunk:Buffer)=>{this.output=(this.output+chunk.toString("utf8")).slice(-16000);};child.stdout.on("data",collect);child.stderr.on("data",collect);
    child.on("error",error=>{this.error=error.message;this.loginProcess=undefined;});child.on("close",code=>{if(code!==0)this.error=`Device login exited with code ${code}`;this.loginProcess=undefined;});
  }
  cancel(){this.loginProcess?.kill("SIGTERM");this.loginProcess=undefined;}
}
