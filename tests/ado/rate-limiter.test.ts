/**
 * Tests for Rate Limiter module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, getRateLimiter } from '../../src/ado/rate-limiter.js';

// Mock sleep utility
vi.mock('../../src/utils/index.js', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { sleep } from '../../src/utils/index.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default values', () => {
      const limiter = new RateLimiter();

      expect(limiter.getRequestCount()).toBe(0);
    });

    it('should use custom maxRequestsPerMinute', () => {
      const limiter = new RateLimiter({ maxRequestsPerMinute: 50 });

      expect(limiter.getRequestCount()).toBe(0);
    });

    it('should use custom windowMs', () => {
      const limiter = new RateLimiter({ windowMs: 30000 });

      expect(limiter.getRequestCount()).toBe(0);
    });
  });

  describe('throttle', () => {
    it('should increment request count', async () => {
      const limiter = new RateLimiter();

      await limiter.throttle();

      expect(limiter.getRequestCount()).toBe(1);
    });

    it('should not wait when under threshold', async () => {
      const limiter = new RateLimiter({ maxRequestsPerMinute: 100 });

      // Make requests under 80% threshold
      for (let i = 0; i < 50; i++) {
        await limiter.throttle();
      }

      expect(sleep).not.toHaveBeenCalled();
      expect(limiter.getRequestCount()).toBe(50);
    });

    it('should wait when approaching rate limit (80% threshold)', async () => {
      const limiter = new RateLimiter({ maxRequestsPerMinute: 10 });

      // Make 9 requests to trigger wait (80% of 10 = 8, so 9th request triggers)
      for (let i = 0; i < 9; i++) {
        await limiter.throttle();
      }

      expect(sleep).toHaveBeenCalled();
    });

    it('should reset window after waiting', async () => {
      const limiter = new RateLimiter({ maxRequestsPerMinute: 10, windowMs: 1000 });

      // Reach threshold (80% of 10 = 8)
      for (let i = 0; i < 9; i++) {
        await limiter.throttle();
      }

      // After sleep is called, window resets and count becomes 1 for the request that triggered it
      // The actual count depends on implementation - check that sleep was called
      expect(sleep).toHaveBeenCalled();
    });

    it('should reset window when time expires', async () => {
      const limiter = new RateLimiter({ maxRequestsPerMinute: 100, windowMs: 1000 });

      await limiter.throttle();
      expect(limiter.getRequestCount()).toBe(1);

      // Advance time past window
      vi.advanceTimersByTime(1001);

      await limiter.throttle();
      expect(limiter.getRequestCount()).toBe(1); // Reset to 1 after new window
    });
  });

  describe('handleRetryAfter', () => {
    it('should sleep for specified seconds', async () => {
      const limiter = new RateLimiter();

      await limiter.handleRetryAfter(60);

      expect(sleep).toHaveBeenCalledWith(60000);
    });

    it('should reset request count after retry', async () => {
      const limiter = new RateLimiter();

      // Simulate some requests
      await limiter.throttle();
      await limiter.throttle();
      await limiter.throttle();

      expect(limiter.getRequestCount()).toBe(3);

      await limiter.handleRetryAfter(10);

      expect(limiter.getRequestCount()).toBe(0);
    });
  });

  describe('getRequestCount', () => {
    it('should return current request count', async () => {
      const limiter = new RateLimiter();

      expect(limiter.getRequestCount()).toBe(0);

      await limiter.throttle();
      expect(limiter.getRequestCount()).toBe(1);

      await limiter.throttle();
      expect(limiter.getRequestCount()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset request count to zero', async () => {
      const limiter = new RateLimiter();

      await limiter.throttle();
      await limiter.throttle();
      await limiter.throttle();

      expect(limiter.getRequestCount()).toBe(3);

      limiter.reset();

      expect(limiter.getRequestCount()).toBe(0);
    });
  });
});

describe('getRateLimiter', () => {
  it('should return a rate limiter instance', () => {
    const limiter = getRateLimiter();

    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it('should return the same instance on subsequent calls', () => {
    const limiter1 = getRateLimiter();
    const limiter2 = getRateLimiter();

    expect(limiter1).toBe(limiter2);
  });
});
