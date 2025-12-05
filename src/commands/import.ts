/**
 * Import Command - Import work items from Azure DevOps into a new YAML file
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ImportOptions as ImportCommandOptions } from '../types/config.js';
import { writeYamlFile } from '../yaml/writer.js';
import { loadConfig } from '../config/config-manager.js';
import { getAdoClient } from '../ado/client.js';
import { importFromAdo, countItems } from '../core/import-engine.js';
import { success, error as logError, warn, info } from '../utils/logger.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { colors, formatId } from '../utils/colors.js';
import { renderTable } from '../utils/table.js';

/**
 * Command options
 */
export interface ImportCommandOpts {
  parentId: number;
  org?: string;
  project?: string;
  includeComments?: boolean;
  includePRs?: boolean;
}

/**
 * Execute import command
 */
export async function importCommand(
  file: string,
  options: ImportCommandOpts
): Promise<void> {
  const { parentId, org, project, includeComments = true, includePRs = true } = options;

  // Validate parent ID
  if (!parentId || isNaN(parentId)) {
    logError('Invalid parent ID. Please provide a valid Azure DevOps work item ID.');
    process.exit(1);
  }

  // Check if file directory exists, create if needed
  const dir = path.dirname(file);
  if (dir && dir !== '.') {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      logError(`Could not create directory: ${dir}`);
      process.exit(1);
    }
  }

  // Load config
  startSpinner('Loading configuration...');
  let config;
  try {
    config = await loadConfig({
      organization: org,
      project: project,
    });
    succeedSpinner('Configuration loaded');
  } catch (err) {
    failSpinner('Failed to load configuration');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }

  // Create client
  const client = getAdoClient({
    organization: config.organization,
    project: config.project,
  });

  // Test connection
  startSpinner('Connecting to Azure DevOps...');
  try {
    const connected = await client.testConnection();
    if (!connected) {
      failSpinner('Connection failed');
      logError('Could not connect to Azure DevOps. Check your PAT and organization/project settings.');
      process.exit(1);
    }
    succeedSpinner(`Connected to ${config.organization}/${config.project}`);
  } catch (err) {
    failSpinner('Connection failed');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }

  // Import work items
  startSpinner(`Importing work item #${parentId} and children...`);
  try {
    const { document, results } = await importFromAdo(client, parentId, config, {
      includeComments,
      includePRs,
    });

    succeedSpinner('Import completed');

    // Display results
    console.log('');
    displayResults(results);

    // Count total items
    const totalItems = document.workItems.reduce((sum, item) => sum + countItems(item), 0);

    // Save YAML file
    await writeYamlFile(file, document);
    info(`\nSaved to ${colors.bold(file)}`);

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log('');
    success(`Summary: ${totalItems} work items imported (${successCount} succeeded, ${failedCount} failed)`);

    if (failedCount > 0) {
      warn('Some items failed to import. Check the errors above.');
    }

    // Next steps
    console.log('');
    info('Next steps:');
    info(`  1. Review the YAML file: ${colors.cyan(file)}`);
    info(`  2. Validate: ${colors.cyan(`ado-sync validate ${file}`)}`);
    info(`  3. Check status: ${colors.cyan(`ado-sync status ${file}`)}`);
  } catch (err) {
    failSpinner('Import failed');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }
}

/**
 * Display import results
 */
function displayResults(results: Array<{
  adoId: number;
  localId: string;
  type: string;
  title: string;
  success: boolean;
  error?: string;
  childCount: number;
}>): void {
  const tableData = results.map(r => ({
    adoId: formatId(r.adoId, '#'),
    localId: r.localId,
    type: r.type,
    status: r.success ? colors.success('✓') : colors.error('✗'),
    children: r.childCount > 0 ? colors.dim(`${r.childCount} children`) : colors.dim('-'),
    title: truncate(r.title, 40),
    error: r.error ? colors.error(r.error) : '',
  }));

  const table = renderTable(tableData, {
    columns: [
      { header: 'ADO ID', key: 'adoId', width: 10 },
      { header: 'Local ID', key: 'localId', width: 15 },
      { header: 'Type', key: 'type', width: 20 },
      { header: '', key: 'status', width: 3 },
      { header: 'Children', key: 'children', width: 12 },
      { header: 'Title', key: 'title', width: 40 },
    ],
  });

  console.log(table);

  // Show errors separately
  const errors = results.filter(r => !r.success);
  if (errors.length > 0) {
    console.log('');
    logError('Errors:');
    for (const e of errors) {
      console.log(`  ${formatId(e.adoId, '#')}: ${e.error}`);
    }
  }
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
