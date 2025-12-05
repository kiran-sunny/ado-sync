/**
 * Tests for Comments API module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getComments, getAllComments, addComment } from '../../src/ado/comments.js';
import type { AdoClient } from '../../src/ado/client.js';

describe('Comments API', () => {
  let mockClient: AdoClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getProject: vi.fn().mockReturnValue('test-project'),
      getOrganization: vi.fn().mockReturnValue('test-org'),
      getBaseUrl: vi.fn().mockReturnValue('https://dev.azure.com/test-org'),
    } as unknown as AdoClient;
  });

  describe('getComments', () => {
    it('should get comments for a work item', async () => {
      const mockResponse = {
        count: 2,
        comments: [
          {
            id: 1,
            text: 'First comment',
            createdBy: { displayName: 'John Doe', uniqueName: 'john@test.com' },
            createdDate: '2025-01-01T10:00:00Z',
          },
          {
            id: 2,
            text: 'Second comment',
            createdBy: { displayName: 'Jane Doe', uniqueName: 'jane@test.com' },
            createdDate: '2025-01-02T10:00:00Z',
          },
        ],
      };
      vi.mocked(mockClient.get).mockResolvedValue(mockResponse);

      const result = await getComments(mockClient, 123);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123/comments',
        { 'api-version': '7.1-preview.4' }
      );
      expect(result.count).toBe(2);
      expect(result.comments).toHaveLength(2);
    });

    it('should include top parameter when provided', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({ count: 0, comments: [] });

      await getComments(mockClient, 123, 50);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123/comments',
        { '$top': 50, 'api-version': '7.1-preview.4' }
      );
    });

    it('should include continuationToken when provided', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({ count: 0, comments: [] });

      await getComments(mockClient, 123, undefined, 'token123');

      expect(mockClient.get).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123/comments',
        { continuationToken: 'token123', 'api-version': '7.1-preview.4' }
      );
    });
  });

  describe('getAllComments', () => {
    it('should get all comments with pagination', async () => {
      // First page returns 100 comments
      const page1Comments = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: i + 1,
          text: `Comment ${i + 1}`,
          createdBy: { displayName: 'User', uniqueName: 'user@test.com' },
          createdDate: '2025-01-01T10:00:00Z',
        }));

      // Second page returns less than 100
      const page2Comments = Array(50)
        .fill(null)
        .map((_, i) => ({
          id: i + 101,
          text: `Comment ${i + 101}`,
          createdBy: { displayName: 'User', uniqueName: 'user@test.com' },
          createdDate: '2025-01-02T10:00:00Z',
        }));

      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({ count: 100, comments: page1Comments })
        .mockResolvedValueOnce({ count: 50, comments: page2Comments });

      const result = await getAllComments(mockClient, 123);

      expect(mockClient.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(150);
    });

    it('should return empty array when no comments', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({ count: 0, comments: [] });

      const result = await getAllComments(mockClient, 123);

      expect(result).toEqual([]);
    });

    it('should transform comments to internal format', async () => {
      const mockResponse = {
        count: 1,
        comments: [
          {
            id: 1,
            text: 'Test comment',
            createdBy: { displayName: 'John Doe', uniqueName: 'john@test.com' },
            createdDate: '2025-01-01T10:00:00Z',
          },
        ],
      };
      vi.mocked(mockClient.get).mockResolvedValue(mockResponse);

      const result = await getAllComments(mockClient, 123);

      expect(result[0]).toEqual({
        id: 1,
        author: 'John Doe',
        date: '2025-01-01T10:00:00Z',
        text: 'Test comment',
      });
    });

    it('should use uniqueName when displayName is not available', async () => {
      const mockResponse = {
        count: 1,
        comments: [
          {
            id: 1,
            text: 'Test comment',
            createdBy: { displayName: '', uniqueName: 'john@test.com' },
            createdDate: '2025-01-01T10:00:00Z',
          },
        ],
      };
      vi.mocked(mockClient.get).mockResolvedValue(mockResponse);

      const result = await getAllComments(mockClient, 123);

      expect(result[0]?.author).toBe('john@test.com');
    });
  });

  describe('addComment', () => {
    it('should add a comment to a work item', async () => {
      const mockResponse = {
        id: 1,
        text: 'New comment',
        createdBy: { displayName: 'John Doe', uniqueName: 'john@test.com' },
        createdDate: '2025-01-01T10:00:00Z',
      };
      vi.mocked(mockClient.post).mockResolvedValue(mockResponse);

      const result = await addComment(mockClient, 123, 'New comment');

      expect(mockClient.post).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123/comments',
        { text: 'New comment' },
        { 'api-version': '7.1-preview.4' }
      );
      expect(result.id).toBe(1);
      expect(result.text).toBe('New comment');
    });
  });
});
