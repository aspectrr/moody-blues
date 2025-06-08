import { z } from "zod";

/**
 * Zod Schema for Ollama API Version Response
 */
export const ApiVersionSchema = z.object({
  version: z.string(),
});

/**
 * Ollama API Version extracted from Zod schema
 */
export type ApiVersion = z.infer<typeof ApiVersionSchema>;
