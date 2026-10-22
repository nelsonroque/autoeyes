import type { BrowserController } from "./BrowserController.js";
export class DOMAgent {
  constructor(private browser: BrowserController) {}
  private page() { if (!this.browser.page) throw new Error("No assessment browser is running"); return this.browser.page; }
  async discover() {
    return this.page().locator("button, input, textarea, select, a, [role=button], canvas").evaluateAll((nodes) => nodes.slice(0,200).map((node, index) => {
      const el=node as HTMLElement; const rect=el.getBoundingClientRect();
      return { index, tag:el.tagName.toLowerCase(), id:el.id||undefined, role:el.getAttribute("role")||undefined, text:(el.innerText||el.getAttribute("aria-label")||"").trim().slice(0,160), x:Math.round(rect.x), y:Math.round(rect.y), width:Math.round(rect.width), height:Math.round(rect.height) };
    }));
  }
  async click(selector:string) { await this.page().locator(selector).click(); }
  async type(selector:string,text:string) { await this.page().locator(selector).fill(text); }
  async text(selector="body") { return this.page().locator(selector).innerText(); }
}
