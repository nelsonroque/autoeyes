import { test,expect } from "@playwright/test";
test("dashboard launches canvas mock, records, and replays a coordinate strategy",async({page,request})=>{
  await page.goto("/");await expect(page.getByText("Automation Studio")).toBeVisible();
  const mock="http://localhost:4310/mock-assessment";
  expect((await request.post("http://localhost:4310/api/browser/launch",{data:{url:mock,viewport:{width:1280,height:800}}})).ok()).toBeTruthy();
  await request.post("http://localhost:4310/api/mode",{data:{mode:"dom"}});
  await request.post("http://localhost:4310/api/record/start");
  await request.post("http://localhost:4310/api/dom/action",{data:{action:"click",selector:"#assessmentCanvas"}});
  await expect.poll(async()=>((await (await request.get("http://localhost:4310/api/state")).json()).recording.actions),{timeout:5000}).toBe(1);
  const recorded=await (await request.post("http://localhost:4310/api/record/stop",{data:{name:"E2E canvas recording"}})).json();
  expect(recorded.steps).toHaveLength(1);expect(recorded.steps[0].type).toBe("click");expect(recorded.metadata.recordingScreenshots.length).toBeGreaterThan(0);
  await request.post("http://localhost:4310/api/browser/restart");
  await request.post(`http://localhost:4310/api/replay/${recorded.id}`,{data:{mode:"scripted"}});
  await expect.poll(async()=>((await (await request.get("http://localhost:4310/api/state")).json()).run?.status),{timeout:15000}).toBe("completed");
  const state=await (await request.get("http://localhost:4310/api/state")).json();expect(state.run.actions[0].status).toBe("success");expect(state.run.screenshots.length).toBeGreaterThan(0);
  await request.post("http://localhost:4310/api/browser/stop");
});
