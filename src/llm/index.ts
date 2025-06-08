import ollama from "ollama";
import type { ApiVersion } from "../types/ollama.js";
import { formatError } from "../utils/error.js";

// Store the Ollama model name from env
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// Statistics for monitoring
let totalTokensUsed = 0;
let totalRequestsCount = 0;
let lastRequestTime: Date | null = null;
let failedRequestsCount = 0;

/**
 * Initialize the LLM connection
 */
export async function setupLLM(): Promise<void> {
  try {
    // Test the connection to Ollama
    const response = await fetch(`${OLLAMA_BASE_URL}/api/version`);

    if (!response.ok) {
      throw new Error(
        `Failed to connect to Ollama: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as ApiVersion;
    console.log(`Connected to Ollama version: ${data.version}`);

    return Promise.resolve();
  } catch (error) {
    console.error("Failed to connect to LLM service:", formatError(error));
    throw error;
  }
}

/**
 * Send a message to the LLM and get a response
 * @param message The user message
 * @param systemPrompt Optional system prompt
 * @param options Additional options
 * @returns The LLM response
 */
export async function sendMessage(
  message: string,
  systemPrompt: string,
  // options?: {
  //   temperature?: number;
  //   maxTokens?: number;
  // },
): Promise<string> {
  try {
    lastRequestTime = new Date();
    totalRequestsCount++;

    // Send the message and get a response
    const response = await ollama.generate({
      prompt: message,
      system: systemPrompt,
      model: OLLAMA_MODEL,
      // options: {
      //   num_predict: options?.maxTokens,
      // },
    });

    // Track token usage (estimated since Ollama doesn't provide this directly)
    // This is a very rough estimate
    const estimatedTokenCount =
      message.split(/\s+/).length + response.response.split(/\s+/).length * 2;
    totalTokensUsed += estimatedTokenCount;

    return response.response;
  } catch (error) {
    failedRequestsCount++;
    console.error("Failed to send message to LLM:", formatError(error));
    throw error;
  }
}

/**
 * Generate an embedding for a text
 * @param text The text to generate an embedding for
 * @returns The embedding vector
 */
// export async function generateTextEmbedding(text: string): Promise<number[]> {
//   try {
//     const embedding = await ollama.generateEmbedding({
//       model: OLLAMA_MODEL,
//       baseUrl: OLLAMA_BASE_URL,
//       prompt: text,
//     });

//     return embedding.embedding;
//   } catch (error) {
//     console.error("Failed to generate embedding:", formatError(error));
//     throw error;
//   }
// }

/**
 * Get statistics about LLM usage
 */
export function getLlmStats() {
  return {
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
    totalRequests: totalRequestsCount,
    failedRequests: failedRequestsCount,
    estimatedTokensUsed: totalTokensUsed,
    lastRequestTime: lastRequestTime?.toISOString(),
    status: "active",
  };
}

/**
 * Reset LLM statistics
 */
export function resetLlmStats() {
  totalTokensUsed = 0;
  totalRequestsCount = 0;
  failedRequestsCount = 0;
  lastRequestTime = null;
}
