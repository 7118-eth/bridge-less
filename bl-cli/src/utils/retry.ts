/**
 * Retry utility with exponential backoff for the HTLC bridge coordinator
 */

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds
   */
  maxDelay?: number;

  /**
   * Backoff multiplier (e.g., 2 for exponential backoff)
   */
  backoffMultiplier?: number;

  /**
   * Whether to add jitter to delays
   */
  jitter?: boolean;

  /**
   * Custom function to determine if error is retryable
   */
  isRetryable?: (error: unknown) => boolean;

  /**
   * Callback for retry events
   */
  onRetry?: (attempt: number, error: unknown, nextDelay: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
  onRetry: () => {},
};

/**
 * Error thrown when retry attempts are exhausted
 */
export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown
  ) {
    super(message);
    this.name = "RetryError";
  }
}

/**
 * Calculate delay with optional jitter
 */
function calculateDelay(
  baseDelay: number,
  jitter: boolean,
  maxDelay: number
): number {
  let delay = Math.min(baseDelay, maxDelay);
  
  if (jitter) {
    // Add random jitter up to 25% of the delay
    const jitterAmount = delay * 0.25 * Math.random();
    delay = delay + jitterAmount;
  }
  
  return Math.floor(delay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the function
 * @throws {RetryError} When all retry attempts are exhausted
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => await client.sendTransaction(tx),
 *   {
 *     maxAttempts: 5,
 *     initialDelay: 2000,
 *     onRetry: (attempt, error) => {
 *       logger.warn(`Retry attempt ${attempt}`, { error });
 *     }
 *   }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!opts.isRetryable(error)) {
        throw error;
      }

      // Check if we've exhausted attempts
      if (attempt === opts.maxAttempts) {
        throw new RetryError(
          `Failed after ${opts.maxAttempts} attempts`,
          opts.maxAttempts,
          lastError
        );
      }

      // Calculate next delay
      const nextDelay = calculateDelay(delay, opts.jitter, opts.maxDelay);
      
      // Call retry callback
      opts.onRetry(attempt, error, nextDelay);

      // Wait before next attempt
      await sleep(nextDelay);

      // Increase delay for next iteration
      delay = delay * opts.backoffMultiplier;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new RetryError(
    `Failed after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    lastError
  );
}

/**
 * Create a retryable version of a function
 * @param fn - The async function to make retryable
 * @param options - Default retry options for this function
 * @returns A new function that automatically retries on failure
 * @example
 * ```typescript
 * const retryableSend = retryable(
 *   async (tx: Transaction) => await client.send(tx),
 *   { maxAttempts: 3 }
 * );
 * 
 * // Use it like a normal function
 * const result = await retryableSend(transaction);
 * ```
 */
export function retryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  defaultOptions?: RetryOptions
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    return retry(() => fn(...args), defaultOptions);
  };
}

/**
 * Common retry strategies
 */
export const RetryStrategies = {
  /**
   * Retry only on network errors
   */
  networkOnly: (error: unknown): boolean => {
    if (error instanceof Error) {
      return error.message.includes("network") ||
             error.message.includes("timeout") ||
             error.message.includes("ECONNREFUSED");
    }
    return false;
  },

  /**
   * Retry on rate limit errors
   */
  rateLimitOnly: (error: unknown): boolean => {
    if (error instanceof Error) {
      return error.message.includes("rate limit") ||
             error.message.includes("429");
    }
    return false;
  },

  /**
   * Retry on both network and rate limit errors
   */
  networkAndRateLimit: (error: unknown): boolean => {
    return RetryStrategies.networkOnly(error) || 
           RetryStrategies.rateLimitOnly(error);
  },
};