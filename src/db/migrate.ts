import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { formatError } from "../utils/error.js";
import "dotenv/config";

/**
 * Run database migrations
 */
async function main() {
  // Ensure DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is not defined");
    process.exit(1);
  }

  console.log("Starting database migration...");

  try {
    // Create a client specifically for migrations
    const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });

    // Create a Drizzle instance with the migration client
    const db = drizzle(migrationClient);

    // Run migrations from the migration folder
    await migrate(db, { migrationsFolder: "./db/migrations" });

    console.log("Migration completed successfully");

    // Close the connection
    await migrationClient.end();

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", formatError(error));
    process.exit(1);
  }
}

// Run the migration
main();
