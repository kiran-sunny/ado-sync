/**
 * Tests for Work Items API module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWorkItem,
  updateWorkItem,
  getWorkItem,
  getWorkItems,
  deleteWorkItem,
  addParentLink,
  removeParentLink,
  extractAdoMetadata,
  hasParentLink,
  getParentId,
  getChildIds,
} from '../../src/ado/work-items.js';
import { createMockAdoResponse, createMockAdoResponseWithRelations } from '../test-utils.js';
import type { AdoClient } from '../../src/ado/client.js';

describe('Work Items API', () => {
  let mockClient: AdoClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getProject: vi.fn().mockReturnValue('test-project'),
      getBaseUrl: vi.fn().mockReturnValue('https://dev.azure.com/test-org'),
    } as unknown as AdoClient;
  });

  describe('createWorkItem', () => {
    it('should create work item with correct endpoint', async () => {
      vi.mocked(mockClient.post).mockResolvedValue(createMockAdoResponse({ id: 123 }));

      await createWorkItem(mockClient, 'Product Backlog Item', {
        type: 'Product Backlog Item',
        id: 'pbi-001',
        title: 'Test PBI',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/$Product%20Backlog%20Item',
        expect.any(Array)
      );
    });

    it('should include title in patch document', async () => {
      vi.mocked(mockClient.post).mockResolvedValue(createMockAdoResponse({ id: 123 }));

      await createWorkItem(mockClient, 'Task', {
        type: 'Task',
        id: 'task-001',
        title: 'Test Task',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            op: 'add',
            path: '/fields/System.Title',
            value: 'Test Task',
          }),
        ])
      );
    });

    it('should include description when provided', async () => {
      vi.mocked(mockClient.post).mockResolvedValue(createMockAdoResponse({ id: 123 }));

      await createWorkItem(mockClient, 'Task', {
        type: 'Task',
        id: 'task-001',
        title: 'Test Task',
        description: 'Test description',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            path: '/fields/System.Description',
            value: 'Test description',
          }),
        ])
      );
    });

    it('should convert tags array to semicolon-separated string', async () => {
      vi.mocked(mockClient.post).mockResolvedValue(createMockAdoResponse({ id: 123 }));

      await createWorkItem(mockClient, 'Task', {
        type: 'Task',
        id: 'task-001',
        title: 'Test Task',
        tags: ['tag1', 'tag2', 'tag3'],
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: 'tag1; tag2; tag3',
          }),
        ])
      );
    });

    it('should include all mapped fields', async () => {
      vi.mocked(mockClient.post).mockResolvedValue(createMockAdoResponse({ id: 123 }));

      await createWorkItem(mockClient, 'Product Backlog Item', {
        type: 'Product Backlog Item',
        id: 'pbi-001',
        title: 'Test PBI',
        state: 'New',
        priority: 2,
        effort: 8,
        acceptanceCriteria: 'Test criteria',
      });

      const patchDoc = vi.mocked(mockClient.post).mock.calls[0][1] as any[];

      expect(patchDoc.some((op: any) => op.path === '/fields/System.State')).toBe(true);
      expect(patchDoc.some((op: any) => op.path === '/fields/Microsoft.VSTS.Common.Priority')).toBe(true);
      expect(patchDoc.some((op: any) => op.path === '/fields/Microsoft.VSTS.Scheduling.Effort')).toBe(true);
      expect(patchDoc.some((op: any) => op.path === '/fields/Microsoft.VSTS.Common.AcceptanceCriteria')).toBe(true);
    });
  });

  describe('updateWorkItem', () => {
    it('should update work item by ID', async () => {
      vi.mocked(mockClient.patch).mockResolvedValue(createMockAdoResponse({ id: 123, rev: 2 }));

      await updateWorkItem(mockClient, 123, {
        type: 'Task',
        id: 'task-001',
        title: 'Updated Title',
      });

      expect(mockClient.patch).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123',
        expect.any(Array)
      );
    });

    it('should include revision check for optimistic concurrency', async () => {
      vi.mocked(mockClient.patch).mockResolvedValue(createMockAdoResponse({ id: 123, rev: 3 }));

      await updateWorkItem(
        mockClient,
        123,
        { type: 'Task', id: 'task-001', title: 'Updated' },
        2 // Expected revision
      );

      const patchDoc = vi.mocked(mockClient.patch).mock.calls[0][1] as any[];

      expect(patchDoc[0]).toEqual({
        op: 'test',
        path: '/rev',
        value: 2,
      });
    });

    it('should not include revision check when not provided', async () => {
      vi.mocked(mockClient.patch).mockResolvedValue(createMockAdoResponse({ id: 123, rev: 2 }));

      await updateWorkItem(mockClient, 123, {
        type: 'Task',
        id: 'task-001',
        title: 'Updated',
      });

      const patchDoc = vi.mocked(mockClient.patch).mock.calls[0][1] as any[];

      expect(patchDoc.every((op: any) => op.op !== 'test')).toBe(true);
    });
  });

  describe('getWorkItem', () => {
    it('should get work item by ID', async () => {
      vi.mocked(mockClient.get).mockResolvedValue(createMockAdoResponse({ id: 123 }));

      const result = await getWorkItem(mockClient, 123);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123',
        undefined
      );
      expect(result.id).toBe(123);
    });

    it('should include expand parameter when provided', async () => {
      vi.mocked(mockClient.get).mockResolvedValue(createMockAdoResponse({ id: 123 }));

      await getWorkItem(mockClient, 123, 'Relations');

      expect(mockClient.get).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123',
        { $expand: 'Relations' }
      );
    });
  });

  describe('getWorkItems', () => {
    it('should return empty array for empty IDs', async () => {
      const result = await getWorkItems(mockClient, []);

      expect(result).toEqual([]);
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should batch fetch work items', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        value: [
          createMockAdoResponse({ id: 1 }),
          createMockAdoResponse({ id: 2 }),
        ],
      });

      const result = await getWorkItems(mockClient, [1, 2]);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitemsbatch',
        expect.objectContaining({
          ids: [1, 2],
          $expand: 'Relations',
        })
      );
      expect(result).toHaveLength(2);
    });

    it('should use provided expand parameter', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        value: [createMockAdoResponse({ id: 1 })],
      });

      await getWorkItems(mockClient, [1], 'Fields');

      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          $expand: 'Fields',
        })
      );
    });

    it('should split large requests into batches', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        value: Array(200).fill(null).map((_, i) => createMockAdoResponse({ id: i + 1 })),
      });

      // Create 250 IDs (will be split into 2 batches)
      const ids = Array(250).fill(null).map((_, i) => i + 1);

      await getWorkItems(mockClient, ids);

      expect(mockClient.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteWorkItem', () => {
    it('should delete work item by ID', async () => {
      vi.mocked(mockClient.delete).mockResolvedValue(undefined);

      await deleteWorkItem(mockClient, 123);

      expect(mockClient.delete).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123',
        { destroy: 'false' }
      );
    });

    it('should permanently delete when destroy is true', async () => {
      vi.mocked(mockClient.delete).mockResolvedValue(undefined);

      await deleteWorkItem(mockClient, 123, true);

      expect(mockClient.delete).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/123',
        { destroy: 'true' }
      );
    });
  });

  describe('addParentLink', () => {
    it('should add parent link to child work item', async () => {
      vi.mocked(mockClient.patch).mockResolvedValue(createMockAdoResponse({ id: 200 }));

      await addParentLink(mockClient, 200, 100);

      expect(mockClient.patch).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/200',
        expect.arrayContaining([
          expect.objectContaining({
            op: 'add',
            path: '/relations/-',
            value: expect.objectContaining({
              rel: 'System.LinkTypes.Hierarchy-Reverse',
              url: 'https://dev.azure.com/test-org/test-project/_apis/wit/workItems/100',
            }),
          }),
        ])
      );
    });
  });

  describe('removeParentLink', () => {
    it('should remove parent link by relation index', async () => {
      vi.mocked(mockClient.patch).mockResolvedValue(createMockAdoResponse({ id: 200 }));

      await removeParentLink(mockClient, 200, 0);

      expect(mockClient.patch).toHaveBeenCalledWith(
        '/test-project/_apis/wit/workitems/200',
        expect.arrayContaining([
          expect.objectContaining({
            op: 'remove',
            path: '/relations/0',
          }),
        ])
      );
    });
  });

  describe('extractAdoMetadata', () => {
    it('should extract metadata from ADO response', () => {
      const response = createMockAdoResponse({
        id: 123,
        rev: 5,
        fields: {
          'System.State': 'Active',
          'System.AssignedTo': { displayName: 'John Doe', uniqueName: 'john@test.com' },
          'System.WorkItemType': 'Product Backlog Item',
        },
      });

      const metadata = extractAdoMetadata(response, 'test-project', 'test-org');

      expect(metadata.workItemId).toBe(123);
      expect(metadata.rev).toBe(5);
      expect(metadata.url).toBe('https://dev.azure.com/test-org/test-project/_workitems/edit/123');
      expect(metadata.state).toBe('Active');
      expect(metadata.assignedTo).toBe('John Doe');
      expect(metadata.lastSyncedAt).toBeDefined();
    });

    it('should handle missing assignedTo', () => {
      const response = createMockAdoResponse({
        id: 123,
        rev: 1,
        fields: {
          'System.State': 'New',
          'System.WorkItemType': 'Task',
        },
      });

      const metadata = extractAdoMetadata(response, 'test-project', 'test-org');

      expect(metadata.assignedTo).toBeUndefined();
    });
  });

  describe('hasParentLink', () => {
    it('should return true when work item has parent', () => {
      const workItem = createMockAdoResponseWithRelations(100);

      expect(hasParentLink(workItem)).toBe(true);
    });

    it('should return false when work item has no parent', () => {
      const workItem = createMockAdoResponse();

      expect(hasParentLink(workItem)).toBe(false);
    });

    it('should return false when relations is undefined', () => {
      const workItem = createMockAdoResponse();
      delete (workItem as any).relations;

      expect(hasParentLink(workItem)).toBe(false);
    });
  });

  describe('getParentId', () => {
    it('should return parent ID from relations', () => {
      const workItem = createMockAdoResponseWithRelations(100);

      expect(getParentId(workItem)).toBe(100);
    });

    it('should return null when no parent link', () => {
      const workItem = createMockAdoResponse();

      expect(getParentId(workItem)).toBeNull();
    });

    it('should return null when relations is undefined', () => {
      const workItem = createMockAdoResponse();
      delete (workItem as any).relations;

      expect(getParentId(workItem)).toBeNull();
    });
  });

  describe('getChildIds', () => {
    it('should return child IDs from relations', () => {
      const workItem = createMockAdoResponseWithRelations(undefined, [200, 201, 202]);

      const childIds = getChildIds(workItem);

      expect(childIds).toEqual([200, 201, 202]);
    });

    it('should return empty array when no children', () => {
      const workItem = createMockAdoResponse();

      expect(getChildIds(workItem)).toEqual([]);
    });

    it('should return empty array when relations is undefined', () => {
      const workItem = createMockAdoResponse();
      delete (workItem as any).relations;

      expect(getChildIds(workItem)).toEqual([]);
    });
  });
});
