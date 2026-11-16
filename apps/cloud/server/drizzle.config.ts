import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./shared/db/schema",
  out: "./shared/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
