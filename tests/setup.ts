import { randomBytes } from "node:crypto";
process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.SESSION_SECRET ??= "test-secret";
process.env.APP_URL ??= "http://localhost:3000";
process.env.TEST_DATABASE_URL ??= "postgres://misfinanzas:misfinanzas_local@localhost:5433/misfinanzas_test";
