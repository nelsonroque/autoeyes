import type { BrowserController } from "./BrowserController.js";
export class ScreenObserver {
  constructor(private browser: BrowserController) {}
  captureBuffer() { return this.browser.screenshotBuffer(); }
  captureDataUrl() { return this.browser.currentScreenshotDataUrl(); }
  captureToLog(label = "observation") { return this.browser.screenshot(label); }
}
