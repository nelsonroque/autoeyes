import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { parseCodexLoginStatus } from "../src/CodexAuthService";

describe("Codex device authentication status",()=>{
  it("recognizes ChatGPT device-auth sessions",()=>assert.deepEqual(parseCodexLoginStatus("Logged in using ChatGPT\n"),{authenticated:true,method:"ChatGPT"}));
  it("does not treat a signed-out response as authenticated",()=>assert.equal(parseCodexLoginStatus("Not logged in").authenticated,false));
});
