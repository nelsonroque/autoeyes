import "dotenv/config";
import { createStudio } from "./app.js";
import { ensureStorage } from "./storage.js";
const port=Number(process.env.PORT??4310);await ensureStorage();const {app}=createStudio();app.listen(port,()=>console.log(`Studio API listening on http://localhost:${port}`));
