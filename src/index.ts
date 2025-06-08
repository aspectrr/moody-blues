import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { setupBot } from "./discord/bot.js";
import { setupDatabase } from "./db/index.js";
import { setupLLM } from "./llm/index.js";
import { startApi } from "./api/index.js";
import { runSimulator } from "./testing/simulator.js";

// Test Mode flag
const TEST_MODE = process.env.TEST_MODE === "true";
const TEST_EXAMPLES_DIR = process.env.TEST_EXAMPLES_DIR;

// Configuration validation - skip some checks in TEST_MODE
const requiredEnvVars = TEST_MODE
  ? ["OLLAMA_BASE_URL", "OLLAMA_MODEL"]
  : [
      "DISCORD_BOT_TOKEN",
      "DISCORD_HELP_CHANNEL_ID",
      "OLLAMA_BASE_URL",
      "OLLAMA_MODEL",
      "DATABASE_URL",
    ];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVars.join(", ")}`,
  );
  console.error("Please check your .env file and try again.");
  process.exit(1);
}

// Initialize client with necessary intents (only in non-test mode)
const client = TEST_MODE
  ? null
  : new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

/**
 * Run in test mode - simulating issues without Discord
 */
async function runTestMode() {
  try {
    console.log("🧪 Starting in TEST MODE");

    // Set up LLM connection (required for tests)
    await setupLLM();
    console.log("✓ LLM connection established");

    // In test mode, we can optionally set up the database
    if (process.env.DATABASE_URL) {
      await setupDatabase();
      console.log("✓ Database connection established");
    }

    // Start the simulator with the examples directory
    console.log("📋 Running test simulations...");
    await runSimulator(TEST_EXAMPLES_DIR);

    console.log("✅ Test mode completed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error in test mode:", error);
    process.exit(1);
  }
}

/**
 * Normal bootstrap process for production mode
 */
async function bootstrap() {
  try {
    // Set up database connection
    await setupDatabase();
    console.log("Database connection established");

    // Set up LLM connection
    await setupLLM();
    console.log("LLM connection established");

    // Initialize Discord bot
    if (client) {
      await setupBot(client);
    }

    // Start API for debugging and monitoring
    const server = await startApi();
    console.log(`API server started on ${server.address}`);

    // Login to Discord
    if (client) {
      await client.login(process.env.DISCORD_BOT_TOKEN);
    }
    console.log("Discord bot logged in");
  } catch (error) {
    console.error("Error during bootstrap:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  if (client) client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  if (client) client.destroy();
  process.exit(0);
});

// Start the application in the appropriate mode
if (TEST_MODE) {
  runTestMode().catch((err) => {
    console.error("Fatal error during test mode:", err);
    process.exit(1);
  });
} else {
  bootstrap().catch((err) => {
    console.error("Fatal error during startup:", err);
    process.exit(1);
  });
}
