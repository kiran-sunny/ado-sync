/**
 * YAML Validator - Validates work item documents against schema
 */

import { z } from 'zod';
import type {
  WorkItemsDocument,
  WorkItem,
  HierarchyType,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/index.js';
import { getAllLocalIds } from './parser.js';

/**
 * Zod schemas for runtime validation
 */
const AdoMetadataSchema = z.object({
  workItemId: z.number().nullable(),
  url: z.string().nullable(),
  rev: z.number().nullable(),
  lastSyncedAt: z.string().nullable(),
  etag: z.string().nullable().optional(),
  state: z.string().optional(),
  assignedTo: z.string().optional(),
  comments: z
    .array(
      z.object({
        id: z.number(),
        author: z.string(),
        date: z.string(),
        text: z.string(),
      })
    )
    .optional(),
  linkedPRs: z
    .array(
      z.object({
        id: z.number(),
        title: z.string(),
        status: z.string(),
        url: z.string(),
        repository: z.string().optional(),
      })
    )
    .optional(),
  history: z
    .array(
      z.object({
        date: z.string(),
        field: z.string(),
        oldValue: z.string(),
        newValue: z.string(),
        changedBy: z.string(),
      })
    )
    .optional(),
});

const WorkItemSchema: z.ZodType<WorkItem> = z.lazy(() =>
  z.object({
    type: z.enum([
      'Epic',
      'Feature',
      'Product Backlog Item',
      'User Story',
      'Task',
      'Bug',
      'Issue',
    ]),
    id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    state: z.string().optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    tags: z.array(z.string()).optional(),
    assignedTo: z.string().optional(),
    areaPath: z.string().optional(),
    iterationPath: z.string().optional(),
    valueArea: z.enum(['Business', 'Architectural']).optional(),
    businessValue: z.number().min(0).optional(),
    targetDate: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    effort: z.number().min(0).optional(),
    storyPoints: z.number().min(0).optional(),
    activity: z
      .enum(['Development', 'Testing', 'Documentation', 'Design', 'Requirements'])
      .optional(),
    remainingWork: z.number().min(0).optional(),
    originalEstimate: z.number().min(0).optional(),
    completedWork: z.number().min(0).optional(),
    _ado: AdoMetadataSchema.optional(),
    children: z.array(z.lazy(() => WorkItemSchema)).optional(),
  })
);

const ProjectConfigSchema = z.object({
  organization: z.string().min(1),
  project: z.string().min(1),
  areaPath: z.string().optional(),
  iterationPath: z.string().optional(),
});

const WorkItemsDocumentSchema = z.object({
  schemaVersion: z.literal('1.0'),
  hierarchyType: z.enum(['full', 'medium', 'simple']),
  project: ProjectConfigSchema,
  workItems: z.array(WorkItemSchema).min(1),
});

/**
 * Validate document against Zod schema
 */
export function validateDocument(doc: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Schema validation
  const parseResult = WorkItemsDocumentSchema.safeParse(doc);

  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      });
    }
    return { valid: false, errors, warnings };
  }

  const validDoc = parseResult.data;

  // Additional validations
  validateUniqueIds(validDoc, errors);
  validateHierarchyTypes(validDoc, errors, warnings);
  validateParentChildRelationships(validDoc, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate all local IDs are unique
 */
function validateUniqueIds(doc: WorkItemsDocument, errors: ValidationError[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  function checkIds(items: WorkItem[], path: string) {
    items.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (seen.has(item.id)) {
        duplicates.add(item.id);
        errors.push({
          path: `${itemPath}.id`,
          message: `Duplicate local ID: "${item.id}"`,
          code: 'DUPLICATE_ID',
        });
      }
      seen.add(item.id);

      if (item.children && item.children.length > 0) {
        checkIds(item.children, `${itemPath}.children`);
      }
    });
  }

  checkIds(doc.workItems, 'workItems');
}

/**
 * Validate work item types match hierarchy
 */
function validateHierarchyTypes(
  doc: WorkItemsDocument,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  const hierarchyType = doc.hierarchyType;

  const validRootTypes: Record<HierarchyType, string[]> = {
    full: ['Epic'],
    medium: ['Feature'],
    simple: ['Product Backlog Item', 'User Story', 'Bug'],
  };

  const validChildTypes: Record<string, string[]> = {
    Epic: ['Feature'],
    Feature: ['Product Backlog Item', 'User Story', 'Bug'],
    'Product Backlog Item': ['Task'],
    'User Story': ['Task'],
    Bug: ['Task'],
    Task: [],
  };

  function checkHierarchy(items: WorkItem[], path: string, allowedTypes: string[]) {
    items.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      if (!allowedTypes.includes(item.type)) {
        errors.push({
          path: `${itemPath}.type`,
          message: `Invalid work item type "${item.type}" for hierarchy "${hierarchyType}". Expected one of: ${allowedTypes.join(', ')}`,
          code: 'INVALID_HIERARCHY_TYPE',
        });
      }

      if (item.children && item.children.length > 0) {
        const childAllowed = validChildTypes[item.type] ?? [];
        if (childAllowed.length === 0 && item.children.length > 0) {
          warnings.push({
            path: `${itemPath}.children`,
            message: `Work item type "${item.type}" typically doesn't have children`,
            code: 'UNEXPECTED_CHILDREN',
          });
        }
        checkHierarchy(item.children, `${itemPath}.children`, childAllowed);
      }
    });
  }

  checkHierarchy(doc.workItems, 'workItems', validRootTypes[hierarchyType] ?? []);
}

/**
 * Validate parent-child relationships make sense
 */
function validateParentChildRelationships(
  doc: WorkItemsDocument,
  warnings: ValidationWarning[]
): void {
  function checkRelationships(items: WorkItem[], path: string) {
    items.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      // Check for Tasks with children (unusual)
      if (item.type === 'Task' && item.children && item.children.length > 0) {
        warnings.push({
          path: `${itemPath}.children`,
          message: 'Tasks typically should not have children',
          code: 'TASK_WITH_CHILDREN',
        });
      }

      // Check for very deep nesting
      if (item.children && item.children.length > 0) {
        checkRelationships(item.children, `${itemPath}.children`);
      }
    });
  }

  checkRelationships(doc.workItems, 'workItems');
}

/**
 * Validate document is consistent with ADO metadata
 */
export function validateAdoConsistency(doc: WorkItemsDocument): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  function checkItems(items: WorkItem[], path: string) {
    items.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      if (item._ado?.workItemId && !item._ado.rev) {
        warnings.push({
          path: `${itemPath}._ado`,
          message: `Work item "${item.id}" has ADO ID but no revision number`,
          code: 'MISSING_REV',
        });
      }

      if (item.children && item.children.length > 0) {
        checkItems(item.children, `${itemPath}.children`);
      }
    });
  }

  checkItems(doc.workItems, 'workItems');
  return warnings;
}

/**
 * Quick validation check (returns boolean)
 */
export function isValidDocument(doc: unknown): doc is WorkItemsDocument {
  const result = WorkItemsDocumentSchema.safeParse(doc);
  return result.success;
}

export { WorkItemsDocumentSchema, WorkItemSchema, ProjectConfigSchema };
