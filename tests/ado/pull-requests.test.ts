/**
 * Tests for Pull Requests API module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLinkedPullRequests, searchPullRequestsByWorkItem } from '../../src/ado/pull-requests.js';
import { createMockAdoResponse } from '../test-utils.js';
import type { AdoClient } from '../../src/ado/client.js';
import type { AdoWorkItemResponse } from '../../src/types/ado-api.js';

describe('Pull Requests API', () => {
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

  describe('getLinkedPullRequests', () => {
    it('should return empty array when work item has no relations', async () => {
      const workItem = createMockAdoResponse() as AdoWorkItemResponse;
      delete workItem.relations;

      const result = await getLinkedPullRequests(mockClient, workItem);

      expect(result).toEqual([]);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should return empty array when work item has empty relations', async () => {
      const workItem = {
        ...createMockAdoResponse(),
        relations: [],
      } as AdoWorkItemResponse;

      const result = await getLinkedPullRequests(mockClient, workItem);

      expect(result).toEqual([]);
    });

    it('should return empty array when no PR links exist', async () => {
      const workItem = {
        ...createMockAdoResponse(),
        relations: [
          {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: 'https://dev.azure.com/test-org/_apis/wit/workItems/100',
            attributes: { name: 'Parent' },
          },
        ],
      } as AdoWorkItemResponse;

      const result = await getLinkedPullRequests(mockClient, workItem);

      expect(result).toEqual([]);
    });

    it('should fetch and return linked PRs', async () => {
      const workItem = {
        ...createMockAdoResponse(),
        relations: [
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/test-project/my-repo/42',
            attributes: { name: 'Pull Request' },
          },
        ],
      } as AdoWorkItemResponse;

      vi.mocked(mockClient.get).mockResolvedValue({
        pullRequestId: 42,
        title: 'Fix bug',
        status: 'active',
        repository: { name: 'my-repo' },
      });

      const result = await getLinkedPullRequests(mockClient, workItem);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/test-project/_apis/git/repositories/my-repo/pullrequests/42'
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 42,
        title: 'Fix bug',
        status: 'active',
        url: 'https://dev.azure.com/test-org/test-project/_git/my-repo/pullrequest/42',
        repository: 'my-repo',
      });
    });

    it('should handle multiple PR links', async () => {
      const workItem = {
        ...createMockAdoResponse(),
        relations: [
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/test-project/repo1/10',
            attributes: { name: 'Pull Request' },
          },
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/test-project/repo2/20',
            attributes: { name: 'Pull Request' },
          },
        ],
      } as AdoWorkItemResponse;

      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({
          pullRequestId: 10,
          title: 'PR 1',
          status: 'completed',
          repository: { name: 'repo1' },
        })
        .mockResolvedValueOnce({
          pullRequestId: 20,
          title: 'PR 2',
          status: 'active',
          repository: { name: 'repo2' },
        });

      const result = await getLinkedPullRequests(mockClient, workItem);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(10);
      expect(result[1]?.id).toBe(20);
    });

    it('should skip PRs that fail to fetch', async () => {
      const workItem = {
        ...createMockAdoResponse(),
        relations: [
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/test-project/repo1/10',
            attributes: { name: 'Pull Request' },
          },
          {
            rel: 'ArtifactLink',
            url: 'vstfs:///Git/PullRequestId/test-project/repo2/20',
            attributes: { name: 'Pull Request' },
          },
        ],
      } as AdoWorkItemResponse;

      vi.mocked(mockClient.get)
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          pullRequestId: 20,
          title: 'PR 2',
          status: 'active',
          repository: { name: 'repo2' },
        });

      const result = await getLinkedPullRequests(mockClient, workItem);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(20);
    });

    it('should skip invalid PR URLs', async () => {
      const workItem = {
        ...createMockAdoResponse(),
        relations: [
          {
            rel: 'ArtifactLink',
            url: 'invalid-url',
            attributes: { name: 'Pull Request' },
          },
        ],
      } as AdoWorkItemResponse;

      const result = await getLinkedPullRequests(mockClient, workItem);

      expect(result).toEqual([]);
      expect(mockClient.get).not.toHaveBeenCalled();
    });
  });

  describe('searchPullRequestsByWorkItem', () => {
    it('should search for PRs linked to work item', async () => {
      // Mock repositories list
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({
          value: [{ id: 'repo-1', name: 'my-repo' }],
        })
        // Mock PRs list for repo
        .mockResolvedValueOnce({
          value: [
            { pullRequestId: 42, title: 'Fix bug', status: 'active' },
          ],
        })
        // Mock PR details with work item refs
        .mockResolvedValueOnce({
          pullRequestId: 42,
          title: 'Fix bug',
          status: 'active',
          workItemRefs: [{ id: '123' }],
        });

      const result = await searchPullRequestsByWorkItem(mockClient, 123);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 42,
        title: 'Fix bug',
        status: 'active',
        url: 'https://dev.azure.com/test-org/test-project/_git/my-repo/pullrequest/42',
        repository: 'my-repo',
      });
    });

    it('should return empty array when no repos found', async () => {
      vi.mocked(mockClient.get).mockResolvedValueOnce({ value: [] });

      const result = await searchPullRequestsByWorkItem(mockClient, 123);

      expect(result).toEqual([]);
    });

    it('should filter out PRs not linked to work item', async () => {
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({
          value: [{ id: 'repo-1', name: 'my-repo' }],
        })
        .mockResolvedValueOnce({
          value: [{ pullRequestId: 42, title: 'Other PR', status: 'active' }],
        })
        .mockResolvedValueOnce({
          pullRequestId: 42,
          title: 'Other PR',
          status: 'active',
          workItemRefs: [{ id: '999' }], // Different work item
        });

      const result = await searchPullRequestsByWorkItem(mockClient, 123);

      expect(result).toEqual([]);
    });

    it('should handle repository errors gracefully', async () => {
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({
          value: [
            { id: 'repo-1', name: 'repo1' },
            { id: 'repo-2', name: 'repo2' },
          ],
        })
        .mockRejectedValueOnce(new Error('Repo access denied'))
        .mockResolvedValueOnce({
          value: [{ pullRequestId: 20, title: 'PR', status: 'active' }],
        })
        .mockResolvedValueOnce({
          pullRequestId: 20,
          title: 'PR',
          status: 'active',
          workItemRefs: [{ id: '123' }],
        });

      const result = await searchPullRequestsByWorkItem(mockClient, 123);

      expect(result).toHaveLength(1);
      expect(result[0]?.repository).toBe('repo2');
    });

    it('should return empty array when main request fails', async () => {
      vi.mocked(mockClient.get).mockRejectedValue(new Error('Network error'));

      const result = await searchPullRequestsByWorkItem(mockClient, 123);

      expect(result).toEqual([]);
    });

    it('should handle PRs without work item refs', async () => {
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({
          value: [{ id: 'repo-1', name: 'my-repo' }],
        })
        .mockResolvedValueOnce({
          value: [{ pullRequestId: 42, title: 'PR', status: 'active' }],
        })
        .mockResolvedValueOnce({
          pullRequestId: 42,
          title: 'PR',
          status: 'active',
          // No workItemRefs property
        });

      const result = await searchPullRequestsByWorkItem(mockClient, 123);

      expect(result).toEqual([]);
    });
  });
});
