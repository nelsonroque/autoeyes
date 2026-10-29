import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { screenshotDir, ensureStorage } from "./storage.js";
import type { ConsoleEntry } from "@studio/shared";
import type { RawInputEvent } from "./Recorder.js";

export type CapturedScreenshot={buffer:Buffer;width:number;height:number};
export function fittedScreenshotSize(viewport:{width:number;height:number},maxWidth:number,maxHeight:number){
  const scale=Math.min(1,maxWidth/viewport.width,maxHeight/viewport.height);
  return {width:Math.floor(viewport.width*scale),height:Math.floor(viewport.height*scale),scale};
}

export class BrowserController {
  browser?: Browser; context?: BrowserContext; page?: Page; url?: string;
  errors:string[]=[];
  viewport = { width: 1280, height: 800 };
  headless=process.env.PLAYWRIGHT_HEADLESS==="1";
  private screenRevision=0;
  private consoleHandler: (message: Omit<ConsoleEntry, "timestamp" | "elapsedMs">) => void = () => {};
  setConsoleHandler(handler: typeof this.consoleHandler) { this.consoleHandler = handler; }
  private inputHandler: (event: RawInputEvent) => void | Promise<void> = () => {};
  setInputHandler(handler: typeof this.inputHandler) { this.inputHandler = handler; }
  async launch(url: string, viewport = this.viewport, headless=this.headless) {
    await this.stop(); await ensureStorage(); this.viewport = viewport; this.headless=headless;this.url = url; this.errors=[];
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext({ viewport, deviceScaleFactor: 1 });
    await this.context.exposeBinding("__studioRawInput", (_source, event: RawInputEvent) => {this.markScreenChanged();return this.inputHandler(event);});
    await this.context.addInitScript({content:`(() => {
      const send = event => globalThis.__studioRawInput(event);
      addEventListener("click", e => send({ kind: "click", x: e.clientX, y: e.clientY, button: e.button, time: performance.now() }), true);
      addEventListener("keydown", e => send({ kind: "keydown", key: e.key, repeat: e.repeat, time: performance.now() }), true);
    })();`});
    this.page = await this.context.newPage(); this.page.on("console", message => { const location = message.location(); this.consoleHandler({ type: message.type(), text: message.text(), location }); }); this.page.on("pageerror",error=>this.errors.push(error.message));this.page.on("framenavigated",frame=>{if(frame===this.page?.mainFrame())this.markScreenChanged();});await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });this.markScreenChanged();
  }
  private requirePage() { if (!this.page) throw new Error("No assessment browser is running"); return this.page; }
  async restart() { if (!this.url) throw new Error("No assessment URL to restart"); await this.launch(this.url, this.viewport); }
  async reset() { if (!this.url) throw new Error("No assessment URL to reset"); await this.launch(this.url, this.viewport); }
  async stop() { await this.browser?.close().catch(() => {}); this.browser = this.context = this.page = undefined; }
  markScreenChanged(){this.screenRevision++;}
  async click(x:number,y:number,button:"left"|"right"|"middle"="left") { await this.requirePage().mouse.click(x,y,{button});this.markScreenChanged(); }
  async move(x:number,y:number) { await this.requirePage().mouse.move(x,y);this.markScreenChanged(); }
  async keypress(key:string) { await this.requirePage().keyboard.press(key);this.markScreenChanged(); }
  async type(text:string) { await this.requirePage().keyboard.type(text);this.markScreenChanged(); }
  async saveScreenshot(buffer:Buffer,prefix="screen") { const file=path.join(screenshotDir,`${prefix}-${Date.now()}.png`);await writeFile(file,buffer);return file; }
  async screenshot(prefix="screen") { return this.saveScreenshot(await this.screenshotBuffer(),prefix); }
  async screenshotBuffer() { return this.requirePage().screenshot({ type:"png" }); }
  async fittedScreenshotBuffer(maxWidth:number,maxHeight:number):Promise<CapturedScreenshot>{
    const size=fittedScreenshotSize(this.viewport,maxWidth,maxHeight);
    if(size.scale===1)return {buffer:await this.screenshotBuffer(),width:size.width,height:size.height};
    const session=await this.requirePage().context().newCDPSession(this.requirePage());
    try{
      const result=await session.send("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false,clip:{x:0,y:0,width:this.viewport.width,height:this.viewport.height,scale:size.scale}});
      return {buffer:Buffer.from(result.data,"base64"),width:size.width,height:size.height};
    }finally{await session.detach();}
  }
  async currentScreenshotDataUrl() { return `data:image/png;base64,${(await this.screenshotBuffer()).toString("base64")}`; }
  get status() { return { running: Boolean(this.page), headless:this.headless, url: this.url, viewport: this.viewport, screenRevision:this.screenRevision, errors:this.errors }; }
}
