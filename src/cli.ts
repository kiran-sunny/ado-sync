/**
 * CLI Setup - Command registration and argument parsing
 */

import { Command } from 'commander';
import {
  initCommand,
  validateCommand,
  pushCommand,
  pullCommand,
  syncCommand,
  diffCommand,
  statusCommand,
  linkCommand,
  unlinkCommand,
  configCommand,
} from './commands/index.js';
import type { ConflictStrategy, HierarchyType } from './types/index.js';

const VERSION = '1.0.0';

/**
 * Create and configure CLI
 */
export function createCli(): Command {
  const program = new Command();

  program
    .name('ado-sync')
    .description('Bi-directional sync between YAML work item definitions and Azure DevOps')
    .version(VERSION);

  // Init command
  program
    .command('init [filename]')
    .description('Initialize a new work items YAML file')
    .option('-h, --hierarchy <type>', 'Hierarchy type: full, medium, simple', 'medium')
    .option('-t, --template', 'Include example work items', false)
    .option('--org <organization>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action((filename: string | undefined, options) => {
      return initCommand(filename, {
        hierarchy: options.hierarchy as HierarchyType,
        template: options.template as boolean,
        org: options.org as string | undefined,
        project: options.project as string | undefined,
      });
    });

  // Validate command
  program
    .command('validate <file>')
    .description('Validate YAML file against schema')
    .option('-s, --strict', 'Fail on warnings', false)
    .option('--check-ado', 'Validate against ADO configuration', false)
    .action((file: string, options) => {
      return validateCommand(file, {
        strict: options.strict as boolean,
        checkAdo: options.checkAdo as boolean,
      });
    });

  // Push command
  program
    .command('push <file>')
    .description('Push work items from YAML to Azure DevOps')
    .option('-n, --dry-run', 'Preview changes without applying', false)
    .option('-f, --force', 'Force update even with conflicts', false)
    .option('--create-only', 'Only create new items, skip updates', false)
    .option('--update-only', 'Only update existing items, skip creates', false)
    .option('--filter <pattern>', 'Filter by local ID pattern (glob)', '*')
    .option('--batch-size <size>', 'Items per batch request', '50')
    .action((file: string, options) => {
      return pushCommand(file, {
        dryRun: options.dryRun as boolean,
        force: options.force as boolean,
        createOnly: options.createOnly as boolean,
        updateOnly: options.updateOnly as boolean,
        filter: options.filter as string,
        batchSize: parseInt(options.batchSize as string, 10),
      });
    });

  // Pull command
  program
    .command('pull <file>')
    .description('Pull updates from Azure DevOps to YAML')
    .option('--include-comments', 'Pull work item comments', true)
    .option('--include-prs', 'Pull linked pull requests', true)
    .option('--include-history', 'Pull state change history', false)
    .option('--overwrite-local', 'Overwrite local changes with ADO data', false)
    .action((file: string, options) => {
      return pullCommand(file, {
        includeComments: options.includeComments as boolean,
        includePRs: options.includePrs as boolean,
        includeHistory: options.includeHistory as boolean,
        overwriteLocal: options.overwriteLocal as boolean,
      });
    });

  // Sync command
  program
    .command('sync <file>')
    .description('Bi-directional sync (pull then push)')
    .option(
      '--strategy <strategy>',
      'Conflict resolution: ado-wins, yaml-wins, manual',
      'manual'
    )
    .option('-n, --dry-run', 'Preview changes without applying', false)
    .action((file: string, options) => {
      return syncCommand(file, {
        strategy: options.strategy as ConflictStrategy,
        dryRun: options.dryRun as boolean,
      });
    });

  // Diff command
  program
    .command('diff <file>')
    .description('Show differences between YAML and ADO')
    .option('--format <format>', 'Output format: table, json, yaml', 'table')
    .option('--fields <fields>', 'Fields to compare (comma-separated)')
    .action((file: string, options) => {
      return diffCommand(file, {
        format: options.format as 'table' | 'json' | 'yaml',
        fields: options.fields?.split(','),
      });
    });

  // Status command
  program
    .command('status <file>')
    .description('Show sync status of all work items')
    .option('--format <format>', 'Output format: table, json', 'table')
    .option('--filter <status>', 'Filter by status: synced, pending, conflict, new')
    .action((file: string, options) => {
      return statusCommand(file, {
        format: options.format as 'table' | 'json',
        filter: options.filter as 'synced' | 'pending' | 'conflict' | 'new' | undefined,
      });
    });

  // Link command
  program
    .command('link <file> <local-id> <ado-id>')
    .description('Link a local YAML item to an existing ADO work item')
    .action((file: string, localId: string, adoId: string) => {
      return linkCommand(file, localId, adoId);
    });

  // Unlink command
  program
    .command('unlink <file> <local-id>')
    .description('Remove ADO association from a YAML item')
    .action((file: string, localId: string) => {
      return unlinkCommand(file, localId);
    });

  // Config command
  program
    .command('config <action> [key] [value]')
    .description('Manage configuration (actions: list, get, set, delete)')
    .action((action: string, key?: string, value?: string) => {
      return configCommand(action, key, value);
    });

  return program;
}
