/**
 * Rate Limiter - Handles Azure DevOps API rate limiting
 */

import { sleep } from '../utils/index.js';
import { warn } from '../utils/logger.js';

/**
 * Rate limiter options
 */
export interface RateLimiterOptions {
  maxRequestsPerMinute?: number;
  windowMs?: number;
}

/**
 * Rate Limiter class
 */
export class RateLimiter {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequestsPerMinute: number;
  private readonly windowMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.maxRequestsPerMinute = options.maxRequestsPerMinute ?? 100;
    this.windowMs = options.windowMs ?? 60000;
  }

  /**
   * Throttle before making a request
   */
  async throttle(): Promise<void> {
    const now = Date.now();

    // Reset window if expired
    if (now - this.windowStart >= this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Check if we're approaching the limit (80% threshold)
    if (this.requestCount >= this.maxRequestsPerMinute * 0.8) {
      const waitTime = this.windowMs - (now - this.windowStart);
      warn(`Approaching rate limit. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await sleep(waitTime);
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Handle Retry-After header from API response
   */
  async handleRetryAfter(retryAfterSeconds: number): Promise<void> {
    warn(`Rate limited by API. Waiting ${retryAfterSeconds}s...`);
    await sleep(retryAfterSeconds * 1000);
    this.requestCount = 0;
    this.windowStart = Date.now();
  }

  /**
   * Get current request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.requestCount = 0;
    this.windowStart = Date.now();
  }
}

/**
 * Default rate limiter instance
 */
let defaultRateLimiter: RateLimiter | null = null;

/**
 * Get default rate limiter
 */
export function getRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = new RateLimiter();
  }
  return defaultRateLimiter;
}
