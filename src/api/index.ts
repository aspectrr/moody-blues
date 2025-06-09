import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { getActiveIssues } from "../db/queries";
import { getLlmStats } from "../llm/index";

// Create Fastify instance
const fastify: FastifyInstance = Fastify({
  logger: true,
});

// Register plugins
async function registerPlugins() {
  await fastify.register(cors, {
    origin: true, // Allow all origins in development
  });
}

// Define routes
async function registerRoutes() {
  // Health check endpoint
  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  // Get active issues
  fastify.get("/issues", async () => {
    try {
      const issues = await getActiveIssues();
      return { issues };
    } catch (error) {
      fastify.log.error(error);
      return { error: "Failed to fetch active issues" };
    }
  });

  // Get LLM status and stats
  fastify.get("/llm/stats", async () => {
    try {
      const stats = await getLlmStats();
      return stats;
    } catch (error) {
      fastify.log.error(error);
      return { error: "Failed to fetch LLM stats" };
    }
  });

  // Get agent status
  fastify.get("/agent/status", async () => {
    // This would be implemented with actual agent status tracking
    return {
      activeAgents: 0,
      completedTasks: 0,
      pendingTasks: 0,
    };
  });
}

// Start the server
export async function startApi() {
  try {
    const port = parseInt(process.env.API_PORT || "3000", 10);
    const host = process.env.API_HOST || "0.0.0.0";

    await registerPlugins();
    await registerRoutes();

    await fastify.listen({ port, host });
    return {
      address: `http://${host}:${port}`,
      instance: fastify,
    };
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Export the fastify instance for testing
export { fastify };
