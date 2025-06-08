import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { formatError } from "../utils/error.js";

// Database client instance
let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Initialize the database connection
 */
export async function setupDatabase() {
  try {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not defined");
    }

    // Create the postgres client
    client = postgres(connectionString, { max: 10 });

    // Create the drizzle instance
    db = drizzle(client, { schema });

    // Test the connection
    await db.execute("SELECT 1");

    return db;
  } catch (error) {
    console.error("Failed to connect to database:", formatError(error));
    throw error;
  }
}

/**
 * Get the database instance
 * @throws Error if the database is not initialized
 */
export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call setupDatabase() first.");
  }
  return db;
}

/**
 * Get the postgres client
 * @throws Error if the client is not initialized
 */
export function getClient() {
  if (!client) {
    throw new Error(
      "Database client not initialized. Call setupDatabase() first.",
    );
  }
  return client;
}

/**
 * Close the database connection
 */
export async function closeDatabase() {
  try {
    if (client) {
      await client.end();
      client = null;
      db = null;
      console.log("Database connection closed");
    }
  } catch (error) {
    console.error("Error closing database connection:", formatError(error));
  }
}
