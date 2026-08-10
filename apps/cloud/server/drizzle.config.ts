import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./api/db/schema",
  out: "./api/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
