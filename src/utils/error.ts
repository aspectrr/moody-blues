/**
 * Utility functions for error handling
 */

/**
 * Format an error into a consistent string representation
 * @param error The error object to format
 * @returns Formatted error message
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ""}`;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error, null, 2);
}

/**
 * Create an error with a typed message and optional cause
 * @param message Error message
 * @param cause Optional error cause
 * @returns New Error instance
 */
export function createError(message: string, cause?: unknown): Error {
  const error = new Error(message);
  if (cause) {
    error.cause = cause;
  }
  return error;
}

/**
 * Wrap a function with error handling
 * @param fn Function to wrap
 * @returns Wrapped function that catches errors
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`Error in function ${fn.name}:`, formatError(error));
      throw error;
    }
  };
}
