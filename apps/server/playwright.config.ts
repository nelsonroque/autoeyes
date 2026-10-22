import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./e2e",timeout:60000,use:{baseURL:"http://localhost:5173"},webServer:{command:"PLAYWRIGHT_HEADLESS=1 STUDIO_DATA_DIR=/tmp/autoeyes-e2e-data npm run dev --prefix ../..",url:"http://localhost:5173",reuseExistingServer:true,timeout:120000}});
