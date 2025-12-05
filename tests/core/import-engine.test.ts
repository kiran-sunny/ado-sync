/**
 * Tests for Import Engine module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importFromAdo, countItems } from '../../src/core/import-engine.js';
import { getWorkItem, getChildIds } from '../../src/ado/work-items.js';
import { getAllComments } from '../../src/ado/comments.js';
import { getLinkedPullRequests } from '../../src/ado/pull-requests.js';
import { createMockAdoResponse, createMockAdoResponseWithRelations } from '../test-utils.js';
import type { AdoClient } from '../../src/ado/client.js';
import type { ResolvedConfig } from '../../src/types/config.js';
import type { WorkItem } from '../../src/types/work-item.js';

// Mock dependencies
vi.mock('../../src/ado/work-items.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ado/work-items.js')>();
  return {
    ...actual,
    getWorkItem: vi.fn(),
    getChildIds: vi.fn(),
  };
});

vi.mock('../../src/ado/comments.js', () => ({
  getAllComments: vi.fn(),
}));

vi.mock('../../src/ado/pull-requests.js', () => ({
  getLinkedPullRequests: vi.fn(),
}));

describe('Import Engine', () => {
  let mockClient: AdoClient;
  let mockConfig: ResolvedConfig;

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

    mockConfig = {
      organization: 'test-org',
      project: 'test-project',
      defaults: {},
      sync: {
        conflictStrategy: 'manual',
        batchSize: 50,
        includeComments: true,
        includePRs: true,
        includeHistory: false,
      },
      typeAliases: {},
      customFields: {},
    };

    // Default mock implementations
    vi.mocked(getAllComments).mockResolvedValue([]);
    vi.mocked(getLinkedPullRequests).mockResolvedValue([]);
  });

  describe('importFromAdo', () => {
    it('should import a single work item without children', async () => {
      const mockAdoItem = createMockAdoResponse({
        id: 123,
        fields: {
          'System.Title': 'Test Feature',
          'System.WorkItemType': 'Feature',
          'System.State': 'Active',
        },
      });

      vi.mocked(getWorkItem).mockResolvedValue(mockAdoItem);
      vi.mocked(getChildIds).mockReturnValue([]);

      const { document, results } = await importFromAdo(mockClient, 123, mockConfig);

      expect(document.schemaVersion).toBe('1.0');
      expect(document.project.organization).toBe('test-org');
      expect(document.project.project).toBe('test-project');
      expect(document.workItems).toHaveLength(1);
      expect(document.workItems[0]?.title).toBe('Test Feature');
      expect(document.workItems[0]?.type).toBe('Feature');
      expect(document.workItems[0]?.id).toBe('feat-123');
      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
    });

    it('should import work item with children recursively', async () => {
      const mockFeature = createMockAdoResponse({
        id: 100,
        fields: {
          'System.Title': 'Parent Feature',
          'System.WorkItemType': 'Feature',
          'System.State': 'Active',
        },
      });

      const mockPBI = createMockAdoResponse({
        id: 101,
        fields: {
          'System.Title': 'Child PBI',
          'System.WorkItemType': 'Product Backlog Item',
          'System.State': 'New',
        },
      });

      const mockTask = createMockAdoResponse({
        id: 102,
        fields: {
          'System.Title': 'Grandchild Task',
          'System.WorkItemType': 'Task',
          'System.State': 'To Do',
        },
      });

      vi.mocked(getWorkItem)
        .mockResolvedValueOnce(mockFeature)
        .mockResolvedValueOnce(mockPBI)
        .mockResolvedValueOnce(mockTask);

      vi.mocked(getChildIds)
        .mockReturnValueOnce([101]) // Feature has 1 child
        .mockReturnValueOnce([102]) // PBI has 1 child
        .mockReturnValueOnce([]);   // Task has no children

      const { document, results } = await importFromAdo(mockClient, 100, mockConfig);

      expect(document.workItems).toHaveLength(1);
      expect(document.workItems[0]?.children).toHaveLength(1);
      expect(document.workItems[0]?.children?.[0]?.children).toHaveLength(1);
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should include comments when option is enabled', async () => {
      const mockAdoItem = createMockAdoResponse({
        id: 123,
        fields: {
          'System.Title': 'Test Feature',
          'System.WorkItemType': 'Feature',
        },
      });

      const mockComments = [
        { id: 1, author: 'John', date: '2025-01-01', text: 'Test comment' },
      ];

      vi.mocked(getWorkItem).mockResolvedValue(mockAdoItem);
      vi.mocked(getChildIds).mockReturnValue([]);
      vi.mocked(getAllComments).mockResolvedValue(mockComments);

      const { document } = await importFromAdo(mockClient, 123, mockConfig, {
        includeComments: true,
      });

      expect(document.workItems[0]?._ado?.comments).toEqual(mockComments);
    });

    it('should not include comments when option is disabled', async () => {
      const mockAdoItem = createMockAdoResponse({
        id: 123,
        fields: {
          'System.Title': 'Test Feature',
          'System.WorkItemType': 'Feature',
        },
      });

      vi.mocked(getWorkItem).mockResolvedValue(mockAdoItem);
      vi.mocked(getChildIds).mockReturnValue([]);

      const { document } = await importFromAdo(mockClient, 123, mockConfig, {
        includeComments: false,
      });

      expect(getAllComments).not.toHaveBeenCalled();
      expect(document.workItems[0]?._ado?.comments).toBeUndefined();
    });

    it('should include PRs when option is enabled', async () => {
      const mockAdoItem = createMockAdoResponse({
        id: 123,
        fields: {
          'System.Title': 'Test Feature',
          'System.WorkItemType': 'Feature',
        },
      });

      const mockPRs = [
        { id: 42, title: 'Fix bug', status: 'active', url: 'https://...' },
      ];

      vi.mocked(getWorkItem).mockResolvedValue(mockAdoItem);
      vi.mocked(getChildIds).mockReturnValue([]);
      vi.mocked(getLinkedPullRequests).mockResolvedValue(mockPRs);

      const { document } = await importFromAdo(mockClient, 123, mockConfig, {
        includePRs: true,
      });

      expect(document.workItems[0]?._ado?.linkedPRs).toEqual(mockPRs);
    });

    it('should handle fetch errors gracefully', async () => {
      vi.mocked(getWorkItem).mockRejectedValue(new Error('Not found'));

      await expect(importFromAdo(mockClient, 999, mockConfig)).rejects.toThrow(
        'Could not fetch work item 999'
      );
    });

    it('should continue importing other children when one fails', async () => {
      const mockFeature = createMockAdoResponse({
        id: 100,
        fields: {
          'System.Title': 'Parent Feature',
          'System.WorkItemType': 'Feature',
        },
      });

      const mockPBI = createMockAdoResponse({
        id: 102,
        fields: {
          'System.Title': 'Good PBI',
          'System.WorkItemType': 'Product Backlog Item',
        },
      });

      vi.mocked(getWorkItem)
        .mockResolvedValueOnce(mockFeature)
        .mockRejectedValueOnce(new Error('Access denied')) // First child fails
        .mockResolvedValueOnce(mockPBI);                    // Second child succeeds

      vi.mocked(getChildIds)
        .mockReturnValueOnce([101, 102]) // Feature has 2 children
        .mockReturnValueOnce([]);         // Good PBI has no children

      const { document, results } = await importFromAdo(mockClient, 100, mockConfig);

      expect(document.workItems[0]?.children).toHaveLength(1);
      expect(results).toHaveLength(3);
      expect(results[1]?.success).toBe(false);
      expect(results[2]?.success).toBe(true);
    });

    it('should detect full hierarchy type', async () => {
      const mockEpic = createMockAdoResponse({
        id: 1,
        fields: {
          'System.Title': 'Epic',
          'System.WorkItemType': 'Epic',
        },
      });

      const mockFeature = createMockAdoResponse({
        id: 2,
        fields: {
          'System.Title': 'Feature',
          'System.WorkItemType': 'Feature',
        },
      });

      const mockPBI = createMockAdoResponse({
        id: 3,
        fields: {
          'System.Title': 'PBI',
          'System.WorkItemType': 'Product Backlog Item',
        },
      });

      vi.mocked(getWorkItem)
        .mockResolvedValueOnce(mockEpic)
        .mockResolvedValueOnce(mockFeature)
        .mockResolvedValueOnce(mockPBI);

      vi.mocked(getChildIds)
        .mockReturnValueOnce([2])
        .mockReturnValueOnce([3])
        .mockReturnValueOnce([]);

      const { document } = await importFromAdo(mockClient, 1, mockConfig);

      expect(document.hierarchyType).toBe('full');
    });

    it('should detect medium hierarchy type', async () => {
      const mockFeature = createMockAdoResponse({
        id: 1,
        fields: {
          'System.Title': 'Feature',
          'System.WorkItemType': 'Feature',
        },
      });

      const mockPBI = createMockAdoResponse({
        id: 2,
        fields: {
          'System.Title': 'PBI',
          'System.WorkItemType': 'Product Backlog Item',
        },
      });

      vi.mocked(getWorkItem)
        .mockResolvedValueOnce(mockFeature)
        .mockResolvedValueOnce(mockPBI);

      vi.mocked(getChildIds)
        .mockReturnValueOnce([2])
        .mockReturnValueOnce([]);

      const { document } = await importFromAdo(mockClient, 1, mockConfig);

      expect(document.hierarchyType).toBe('medium');
    });

    it('should detect simple hierarchy type', async () => {
      const mockPBI = createMockAdoResponse({
        id: 1,
        fields: {
          'System.Title': 'PBI',
          'System.WorkItemType': 'Product Backlog Item',
        },
      });

      const mockTask = createMockAdoResponse({
        id: 2,
        fields: {
          'System.Title': 'Task',
          'System.WorkItemType': 'Task',
        },
      });

      vi.mocked(getWorkItem)
        .mockResolvedValueOnce(mockPBI)
        .mockResolvedValueOnce(mockTask);

      vi.mocked(getChildIds)
        .mockReturnValueOnce([2])
        .mockReturnValueOnce([]);

      const { document } = await importFromAdo(mockClient, 1, mockConfig);

      expect(document.hierarchyType).toBe('simple');
    });

    it('should respect max depth option', async () => {
      const mockItem = (id: number, title: string) => createMockAdoResponse({
        id,
        fields: {
          'System.Title': title,
          'System.WorkItemType': 'Task',
        },
      });

      // Create a chain: 1 -> 2 -> 3 -> 4 -> 5
      vi.mocked(getWorkItem)
        .mockResolvedValueOnce(mockItem(1, 'Level 1'))
        .mockResolvedValueOnce(mockItem(2, 'Level 2'))
        .mockResolvedValueOnce(mockItem(3, 'Level 3'));

      vi.mocked(getChildIds)
        .mockReturnValueOnce([2])
        .mockReturnValueOnce([3])
        .mockReturnValueOnce([4]); // This would be depth 3, should be ignored

      const { document, results } = await importFromAdo(mockClient, 1, mockConfig, {
        maxDepth: 2,
      });

      // Should only have 3 levels (0, 1, 2)
      expect(results.filter(r => r.success)).toHaveLength(3);
    });

    it('should map all work item fields correctly', async () => {
      const mockAdoItem = createMockAdoResponse({
        id: 123,
        fields: {
          'System.Title': 'Test Title',
          'System.WorkItemType': 'Product Backlog Item',
          'System.Description': '<p>Test <b>description</b></p>',
          'System.State': 'Active',
          'Microsoft.VSTS.Common.Priority': 2,
          'System.Tags': 'tag1; tag2; tag3',
          'System.AssignedTo': { displayName: 'John Doe', uniqueName: 'john@test.com' },
          'System.AreaPath': 'Project\\Area',
          'System.IterationPath': 'Project\\Sprint 1',
          'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>Criteria 1</li></ul>',
          'Microsoft.VSTS.Scheduling.Effort': 5,
          'Microsoft.VSTS.Scheduling.StoryPoints': 8,
        },
      });

      vi.mocked(getWorkItem).mockResolvedValue(mockAdoItem);
      vi.mocked(getChildIds).mockReturnValue([]);

      const { document } = await importFromAdo(mockClient, 123, mockConfig, {
        includeComments: false,
        includePRs: false,
      });

      const item = document.workItems[0];
      expect(item?.title).toBe('Test Title');
      expect(item?.type).toBe('Product Backlog Item');
      expect(item?.description).toBe('Test description'); // HTML stripped
      expect(item?.state).toBe('Active');
      expect(item?.priority).toBe(2);
      expect(item?.tags).toEqual(['tag1', 'tag2', 'tag3']);
      expect(item?.assignedTo).toBe('John Doe');
      expect(item?.areaPath).toBe('Project\\Area');
      expect(item?.iterationPath).toBe('Project\\Sprint 1');
      expect(item?.acceptanceCriteria).toContain('Criteria 1');
      expect(item?.effort).toBe(5);
      expect(item?.storyPoints).toBe(8);
    });

    it('should generate correct local IDs for different types', async () => {
      const types = [
        { type: 'Epic', prefix: 'epic' },
        { type: 'Feature', prefix: 'feat' },
        { type: 'Product Backlog Item', prefix: 'pbi' },
        { type: 'User Story', prefix: 'story' },
        { type: 'Task', prefix: 'task' },
        { type: 'Bug', prefix: 'bug' },
      ];

      for (const { type, prefix } of types) {
        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({
            id: 999,
            fields: {
              'System.Title': `Test ${type}`,
              'System.WorkItemType': type,
            },
          })
        );
        vi.mocked(getChildIds).mockReturnValue([]);

        const { document } = await importFromAdo(mockClient, 999, mockConfig, {
          includeComments: false,
          includePRs: false,
        });

        expect(document.workItems[0]?.id).toBe(`${prefix}-999`);
      }
    });
  });

  describe('countItems', () => {
    it('should count single item', () => {
      const item: WorkItem = {
        type: 'Task',
        id: 'task-1',
        title: 'Task',
      };

      expect(countItems(item)).toBe(1);
    });

    it('should count items with children', () => {
      const item: WorkItem = {
        type: 'Feature',
        id: 'feat-1',
        title: 'Feature',
        children: [
          {
            type: 'Product Backlog Item',
            id: 'pbi-1',
            title: 'PBI 1',
            children: [
              { type: 'Task', id: 'task-1', title: 'Task 1' },
              { type: 'Task', id: 'task-2', title: 'Task 2' },
            ],
          },
          {
            type: 'Product Backlog Item',
            id: 'pbi-2',
            title: 'PBI 2',
          },
        ],
      };

      expect(countItems(item)).toBe(5);
    });
  });
});
