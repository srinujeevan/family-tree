import path from "node:path";
import dotenv from "dotenv";

// Must run before any test file imports src/config/env (which reads
// process.env at import time), so this overrides whatever .env loaded.
dotenv.config({ path: path.join(__dirname, "..", ".env.test"), override: true });
