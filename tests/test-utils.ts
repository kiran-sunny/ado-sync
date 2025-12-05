/**
 * Test utilities and factory functions
 */

import type {
  WorkItem,
  WorkItemsDocument,
  AdoMetadata,
  HierarchyType,
} from '../src/types/index.js';
import type { AdoWorkItemResponse, WorkItemRelation } from '../src/types/ado-api.js';

/**
 * Create a mock work item
 */
export function createMockWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    type: 'Product Backlog Item',
    id: 'pbi-001',
    title: 'Test PBI',
    state: 'New',
    ...overrides,
  };
}

/**
 * Create a mock work item with children
 */
export function createMockWorkItemWithChildren(
  overrides: Partial<WorkItem> = {},
  childOverrides: Partial<WorkItem>[] = []
): WorkItem {
  const children = childOverrides.length > 0
    ? childOverrides.map((child, index) =>
        createMockWorkItem({
          type: 'Task',
          id: `task-00${index + 1}`,
          title: `Test Task ${index + 1}`,
          ...child,
        })
      )
    : [
        createMockWorkItem({
          type: 'Task',
          id: 'task-001',
          title: 'Test Task 1',
        }),
      ];

  return {
    ...createMockWorkItem(overrides),
    children,
  };
}

/**
 * Create a mock ADO metadata
 */
export function createMockAdoMetadata(overrides: Partial<AdoMetadata> = {}): AdoMetadata {
  return {
    workItemId: 123,
    url: 'https://dev.azure.com/test-org/test-project/_workitems/edit/123',
    rev: 1,
    lastSyncedAt: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

/**
 * Create a mock WorkItemsDocument
 */
export function createMockDocument(
  items: WorkItem[] = [],
  overrides: Partial<Omit<WorkItemsDocument, 'workItems'>> = {}
): WorkItemsDocument {
  return {
    schemaVersion: '1.0',
    hierarchyType: 'simple' as HierarchyType,
    project: {
      organization: 'test-org',
      project: 'test-project',
    },
    workItems: items.length > 0 ? items : [createMockWorkItem()],
    ...overrides,
  };
}

/**
 * Create a full hierarchy document (Epic -> Feature -> PBI -> Task)
 */
export function createMockFullHierarchyDocument(): WorkItemsDocument {
  return {
    schemaVersion: '1.0',
    hierarchyType: 'full',
    project: {
      organization: 'test-org',
      project: 'test-project',
      areaPath: 'test-project\\Team1',
      iterationPath: 'test-project\\Sprint 1',
    },
    workItems: [
      {
        type: 'Epic',
        id: 'epic-001',
        title: 'Test Epic',
        description: 'Epic description',
        state: 'New',
        priority: 1,
        tags: ['Q1-2025', 'strategic'],
        children: [
          {
            type: 'Feature',
            id: 'feat-001',
            title: 'Test Feature',
            description: 'Feature description',
            state: 'New',
            children: [
              {
                type: 'Product Backlog Item',
                id: 'pbi-001',
                title: 'Test PBI',
                description: 'PBI description',
                acceptanceCriteria: '- [ ] Test criteria',
                effort: 8,
                state: 'New',
                children: [
                  {
                    type: 'Task',
                    id: 'task-001',
                    title: 'Test Task',
                    remainingWork: 4,
                    state: 'New',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create a mock ADO work item response
 */
export function createMockAdoResponse(overrides: Partial<AdoWorkItemResponse> = {}): AdoWorkItemResponse {
  return {
    id: 123,
    rev: 1,
    fields: {
      'System.Title': 'Test Work Item',
      'System.State': 'New',
      'System.WorkItemType': 'Product Backlog Item',
      'System.Description': 'Test description',
      'System.AreaPath': 'test-project',
      'System.IterationPath': 'test-project\\Sprint 1',
      'System.Tags': 'tag1; tag2',
      'Microsoft.VSTS.Common.Priority': 2,
    },
    url: 'https://dev.azure.com/test-org/test-project/_apis/wit/workItems/123',
    ...overrides,
  };
}

/**
 * Create a mock ADO response with relations
 */
export function createMockAdoResponseWithRelations(
  parentId?: number,
  childIds: number[] = []
): AdoWorkItemResponse {
  const relations: WorkItemRelation[] = [];

  if (parentId) {
    relations.push({
      rel: 'System.LinkTypes.Hierarchy-Reverse',
      url: `https://dev.azure.com/test-org/test-project/_apis/wit/workItems/${parentId}`,
      attributes: { name: 'Parent' },
    });
  }

  for (const childId of childIds) {
    relations.push({
      rel: 'System.LinkTypes.Hierarchy-Forward',
      url: `https://dev.azure.com/test-org/test-project/_apis/wit/workItems/${childId}`,
      attributes: { name: 'Child' },
    });
  }

  return {
    ...createMockAdoResponse(),
    relations,
  };
}

/**
 * Create mock ADO comment response
 */
export function createMockAdoCommentResponse(count: number = 2) {
  return {
    totalCount: count,
    count,
    comments: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      workItemId: 123,
      text: `Comment ${i + 1}`,
      createdBy: {
        displayName: `User ${i + 1}`,
        uniqueName: `user${i + 1}@example.com`,
      },
      createdDate: new Date(Date.now() - i * 86400000).toISOString(),
      modifiedDate: new Date(Date.now() - i * 86400000).toISOString(),
    })),
  };
}

/**
 * Create mock pull request response
 */
export function createMockPullRequestResponse(count: number = 1) {
  return {
    count,
    value: Array.from({ length: count }, (_, i) => ({
      pullRequestId: 456 + i,
      title: `PR ${i + 1}: Fix something`,
      status: 'active',
      createdBy: {
        displayName: `Developer ${i + 1}`,
        uniqueName: `dev${i + 1}@example.com`,
      },
      creationDate: new Date(Date.now() - i * 86400000).toISOString(),
      repository: {
        id: 'repo-id',
        name: 'test-repo',
        url: 'https://dev.azure.com/test-org/test-project/_git/test-repo',
      },
    })),
  };
}

/**
 * Generate valid YAML content
 */
export function generateValidYaml(doc: WorkItemsDocument = createMockDocument()): string {
  const yaml = `schemaVersion: "${doc.schemaVersion}"
hierarchyType: "${doc.hierarchyType}"

project:
  organization: "${doc.project.organization}"
  project: "${doc.project.project}"
${doc.project.areaPath ? `  areaPath: "${doc.project.areaPath}"` : ''}
${doc.project.iterationPath ? `  iterationPath: "${doc.project.iterationPath}"` : ''}

workItems:
${generateWorkItemsYaml(doc.workItems, 2)}`;

  return yaml;
}

function generateWorkItemsYaml(items: WorkItem[], indent: number): string {
  const spaces = ' '.repeat(indent);
  let yaml = '';

  for (const item of items) {
    yaml += `${spaces}- type: "${item.type}"\n`;
    yaml += `${spaces}  id: "${item.id}"\n`;
    yaml += `${spaces}  title: "${item.title}"\n`;

    if (item.state) {
      yaml += `${spaces}  state: "${item.state}"\n`;
    }

    if (item.description) {
      yaml += `${spaces}  description: |\n`;
      yaml += `${spaces}    ${item.description}\n`;
    }

    if (item._ado) {
      yaml += `${spaces}  _ado:\n`;
      yaml += `${spaces}    workItemId: ${item._ado.workItemId}\n`;
      yaml += `${spaces}    url: "${item._ado.url}"\n`;
      yaml += `${spaces}    rev: ${item._ado.rev}\n`;
      yaml += `${spaces}    lastSyncedAt: "${item._ado.lastSyncedAt}"\n`;
    }

    if (item.children && item.children.length > 0) {
      yaml += `${spaces}  children:\n`;
      yaml += generateWorkItemsYaml(item.children, indent + 4);
    }
  }

  return yaml;
}

/**
 * Generate invalid YAML content
 */
export function generateInvalidYaml(): string {
  return `
schemaVersion: "1.0"
hierarchyType: "simple"

project:
  organization: "test-org"
  # Missing required project field

workItems:
  - type: "InvalidType"  # Invalid work item type
    # Missing required id and title
`;
}

/**
 * Generate YAML with duplicate IDs
 */
export function generateYamlWithDuplicateIds(): string {
  return `
schemaVersion: "1.0"
hierarchyType: "simple"

project:
  organization: "test-org"
  project: "test-project"

workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "First PBI"
  - type: "Product Backlog Item"
    id: "pbi-001"  # Duplicate ID
    title: "Second PBI"
`;
}

/**
 * Generate YAML with invalid hierarchy
 */
export function generateYamlWithInvalidHierarchy(): string {
  return `
schemaVersion: "1.0"
hierarchyType: "simple"

project:
  organization: "test-org"
  project: "test-project"

workItems:
  - type: "Task"
    id: "task-001"
    title: "Task without parent"
    children:
      - type: "Epic"  # Epic cannot be child of Task
        id: "epic-001"
        title: "Invalid child Epic"
`;
}

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise for testing async behavior
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
