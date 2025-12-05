/**
 * Init Command - Initialize a new work items YAML file
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { InitOptions } from '../types/config.js';
import type { WorkItemsDocument, HierarchyType } from '../types/work-item.js';
import { writeYamlFile } from '../yaml/writer.js';
import { success, error as logError, info } from '../utils/logger.js';
import { colors } from '../utils/colors.js';

/**
 * Template work items for each hierarchy type
 */
const TEMPLATES: Record<HierarchyType, WorkItemsDocument> = {
  full: {
    schemaVersion: '1.0',
    hierarchyType: 'full',
    project: {
      organization: '',
      project: '',
    },
    workItems: [
      {
        type: 'Epic',
        id: 'epic-001',
        title: 'Sample Epic',
        description: 'Description of the epic',
        state: 'New',
        priority: 2,
        tags: ['sample'],
        children: [
          {
            type: 'Feature',
            id: 'feat-001',
            title: 'Sample Feature',
            description: 'Description of the feature',
            state: 'New',
            priority: 2,
            children: [
              {
                type: 'Product Backlog Item',
                id: 'pbi-001',
                title: 'Sample PBI',
                description: 'As a user, I want to...',
                acceptanceCriteria: '- [ ] Acceptance criterion 1\n- [ ] Acceptance criterion 2',
                state: 'New',
                priority: 2,
                effort: 5,
                children: [
                  {
                    type: 'Task',
                    id: 'task-001',
                    title: 'Sample Task',
                    description: 'Task description',
                    state: 'To Do',
                    activity: 'Development',
                    remainingWork: 4,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  medium: {
    schemaVersion: '1.0',
    hierarchyType: 'medium',
    project: {
      organization: '',
      project: '',
    },
    workItems: [
      {
        type: 'Feature',
        id: 'feat-001',
        title: 'Sample Feature',
        description: 'Description of the feature',
        state: 'New',
        priority: 2,
        children: [
          {
            type: 'Product Backlog Item',
            id: 'pbi-001',
            title: 'Sample PBI',
            description: 'As a user, I want to...',
            acceptanceCriteria: '- [ ] Acceptance criterion 1\n- [ ] Acceptance criterion 2',
            state: 'New',
            priority: 2,
            effort: 5,
            children: [
              {
                type: 'Task',
                id: 'task-001',
                title: 'Sample Task',
                description: 'Task description',
                state: 'To Do',
                activity: 'Development',
                remainingWork: 4,
              },
            ],
          },
        ],
      },
    ],
  },
  simple: {
    schemaVersion: '1.0',
    hierarchyType: 'simple',
    project: {
      organization: '',
      project: '',
    },
    workItems: [
      {
        type: 'Product Backlog Item',
        id: 'pbi-001',
        title: 'Sample PBI',
        description: 'As a user, I want to...',
        acceptanceCriteria: '- [ ] Acceptance criterion 1\n- [ ] Acceptance criterion 2',
        state: 'New',
        priority: 2,
        effort: 5,
        children: [
          {
            type: 'Task',
            id: 'task-001',
            title: 'Sample Task',
            description: 'Task description',
            state: 'To Do',
            activity: 'Development',
            remainingWork: 4,
          },
          {
            type: 'Task',
            id: 'task-002',
            title: 'Another Task',
            state: 'To Do',
            activity: 'Testing',
            remainingWork: 2,
          },
        ],
      },
    ],
  },
};

/**
 * Execute init command
 */
export async function initCommand(
  filename: string | undefined,
  options: InitOptions
): Promise<void> {
  const targetFile = filename ?? 'workitems.yaml';
  const targetPath = path.resolve(process.cwd(), targetFile);

  // Check if file already exists
  try {
    await fs.access(targetPath);
    logError(`File already exists: ${targetFile}`);
    logError('Use a different filename or delete the existing file.');
    process.exit(1);
  } catch {
    // File doesn't exist, continue
  }

  // Create document from template
  const template = TEMPLATES[options.hierarchy];
  const doc: WorkItemsDocument = {
    ...template,
    project: {
      organization: options.org ?? process.env['ADO_ORGANIZATION'] ?? 'your-organization',
      project: options.project ?? process.env['ADO_PROJECT'] ?? 'your-project',
    },
  };

  // If not using template, create minimal structure
  if (!options.template) {
    doc.workItems = [];
  }

  // Write file
  try {
    await writeYamlFile(targetPath, doc);
    success(`Created ${colors.bold(targetFile)}`);
    info(`Hierarchy type: ${colors.info(options.hierarchy)}`);

    if (options.template) {
      info('Template work items included. Modify them for your needs.');
    } else {
      info('Empty file created. Add your work items to the workItems array.');
    }

    info(`\nNext steps:`);
    info(`  1. Edit ${targetFile} to add your work items`);
    info(`  2. Set ADO_PAT environment variable or run: ado-sync config set pat <token>`);
    info(`  3. Run: ado-sync push ${targetFile} --dry-run`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Failed to create file: ${message}`);
    process.exit(1);
  }
}
