/**
 * Tests for utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sleep,
  retry,
  formatDate,
  formatRelativeTime,
  truncate,
  chunk,
  matchesFilter,
} from '../../src/utils/index.js';

describe('Utils', () => {
  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve after specified milliseconds', async () => {
      const promise = sleep(1000);
      vi.advanceTimersByTime(1000);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should resolve immediately for 0ms', async () => {
      const promise = sleep(0);
      vi.advanceTimersByTime(0);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('retry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');

      const promise = retry(fn, { initialDelay: 100 });

      // Advance timer to allow retry
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Always fail'));

      // Start the retry and immediately set up the rejection handler
      const promise = retry(fn, { maxRetries: 2, initialDelay: 100 }).catch(e => e);

      // Advance through all retries - need to run all pending promises
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400); // Extra time to ensure all retries complete

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Always fail');
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const promise = retry(fn, { initialDelay: 100, factor: 2 });

      // First retry after 100ms
      await vi.advanceTimersByTimeAsync(100);
      // Second retry after 200ms (100 * 2)
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelay', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        initialDelay: 1000,
        maxDelay: 1500,
        factor: 3,
      });

      // First retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry should be capped at 1500ms (not 3000ms)
      await vi.advanceTimersByTimeAsync(1500);

      const result = await promise;

      expect(result).toBe('success');
    });

    it('should not retry when shouldRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Non-retryable'));

      const promise = retry(fn, {
        maxRetries: 3,
        shouldRetry: (error) =>
          error instanceof Error && error.message !== 'Non-retryable',
      });

      await expect(promise).rejects.toThrow('Non-retryable');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatDate', () => {
    it('should format Date object to ISO string', () => {
      const date = new Date('2025-01-15T10:30:00.000Z');

      const result = formatDate(date);

      expect(result).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should format date string to ISO string', () => {
      const result = formatDate('2025-01-15T10:30:00Z');

      expect(result).toContain('2025-01-15');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "just now" for recent times', () => {
      const date = new Date('2025-01-15T11:59:50Z'); // 10 seconds ago

      const result = formatRelativeTime(date);

      expect(result).toBe('just now');
    });

    it('should return minutes ago', () => {
      const date = new Date('2025-01-15T11:45:00Z'); // 15 minutes ago

      const result = formatRelativeTime(date);

      expect(result).toBe('15 minutes ago');
    });

    it('should return "1 minute ago" for singular', () => {
      const date = new Date('2025-01-15T11:59:00Z'); // 1 minute ago

      const result = formatRelativeTime(date);

      expect(result).toBe('1 minute ago');
    });

    it('should return hours ago', () => {
      const date = new Date('2025-01-15T08:00:00Z'); // 4 hours ago

      const result = formatRelativeTime(date);

      expect(result).toBe('4 hours ago');
    });

    it('should return "1 hour ago" for singular', () => {
      const date = new Date('2025-01-15T11:00:00Z'); // 1 hour ago

      const result = formatRelativeTime(date);

      expect(result).toBe('1 hour ago');
    });

    it('should return days ago', () => {
      const date = new Date('2025-01-12T12:00:00Z'); // 3 days ago

      const result = formatRelativeTime(date);

      expect(result).toBe('3 days ago');
    });

    it('should return "1 day ago" for singular', () => {
      const date = new Date('2025-01-14T12:00:00Z'); // 1 day ago

      const result = formatRelativeTime(date);

      expect(result).toBe('1 day ago');
    });

    it('should handle string date input', () => {
      const result = formatRelativeTime('2025-01-14T12:00:00Z');

      expect(result).toBe('1 day ago');
    });
  });

  describe('truncate', () => {
    it('should not truncate string shorter than maxLength', () => {
      const result = truncate('short', 10);

      expect(result).toBe('short');
    });

    it('should not truncate string equal to maxLength', () => {
      const result = truncate('exactly10!', 10);

      expect(result).toBe('exactly10!');
    });

    it('should truncate string longer than maxLength', () => {
      const result = truncate('this is a long string', 10);

      expect(result).toBe('this is...');
      expect(result.length).toBe(10);
    });

    it('should handle empty string', () => {
      const result = truncate('', 10);

      expect(result).toBe('');
    });

    it('should handle maxLength of 3 (minimum for ellipsis)', () => {
      const result = truncate('hello', 3);

      expect(result).toBe('...');
    });
  });

  describe('chunk', () => {
    it('should chunk array into specified sizes', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const result = chunk(array, 3);

      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    });

    it('should return single chunk for array smaller than size', () => {
      const array = [1, 2, 3];

      const result = chunk(array, 5);

      expect(result).toEqual([[1, 2, 3]]);
    });

    it('should return empty array for empty input', () => {
      const result = chunk([], 5);

      expect(result).toEqual([]);
    });

    it('should handle chunk size of 1', () => {
      const array = [1, 2, 3];

      const result = chunk(array, 1);

      expect(result).toEqual([[1], [2], [3]]);
    });

    it('should handle strings in array', () => {
      const array = ['a', 'b', 'c', 'd'];

      const result = chunk(array, 2);

      expect(result).toEqual([['a', 'b'], ['c', 'd']]);
    });
  });

  describe('matchesFilter', () => {
    it('should match all with wildcard "*"', () => {
      expect(matchesFilter('anything', '*')).toBe(true);
      expect(matchesFilter('pbi-001', '*')).toBe(true);
      expect(matchesFilter('', '*')).toBe(true);
    });

    it('should match exact string', () => {
      expect(matchesFilter('pbi-001', 'pbi-001')).toBe(true);
      expect(matchesFilter('pbi-002', 'pbi-001')).toBe(false);
    });

    it('should match prefix with wildcard', () => {
      expect(matchesFilter('pbi-001', 'pbi-*')).toBe(true);
      expect(matchesFilter('pbi-002', 'pbi-*')).toBe(true);
      expect(matchesFilter('task-001', 'pbi-*')).toBe(false);
    });

    it('should match suffix with wildcard', () => {
      expect(matchesFilter('pbi-001', '*-001')).toBe(true);
      expect(matchesFilter('task-001', '*-001')).toBe(true);
      expect(matchesFilter('pbi-002', '*-001')).toBe(false);
    });

    it('should match pattern with wildcard in middle', () => {
      expect(matchesFilter('feature-auth-001', 'feature-*-001')).toBe(true);
      expect(matchesFilter('feature-ui-001', 'feature-*-001')).toBe(true);
      expect(matchesFilter('feature-auth-002', 'feature-*-001')).toBe(false);
    });

    it('should match single character with "?"', () => {
      expect(matchesFilter('pbi-001', 'pbi-00?')).toBe(true);
      expect(matchesFilter('pbi-002', 'pbi-00?')).toBe(true);
      expect(matchesFilter('pbi-0012', 'pbi-00?')).toBe(false);
    });

    it('should escape special regex characters', () => {
      expect(matchesFilter('pbi.001', 'pbi.001')).toBe(true);
      expect(matchesFilter('pbi-001', 'pbi.001')).toBe(false);
      expect(matchesFilter('pbi[1]', 'pbi[1]')).toBe(true);
    });

    it('should handle complex patterns', () => {
      expect(matchesFilter('epic-001', '???c-*')).toBe(true);
      expect(matchesFilter('task-123-done', 'task-???-*')).toBe(true);
    });
  });
});
