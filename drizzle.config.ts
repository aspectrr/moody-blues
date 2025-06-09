import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/migrations",
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    host: "localhost",
    port: 5432,
    database: "moodyblues",
    user: "moodyuser",
    password: "moodypassword",
    ssl: false,
  },
});
