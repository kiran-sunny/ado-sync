/**
 * Pull Command - Pull updates from Azure DevOps
 */

import type { PullOptions } from '../types/config.js';
import { parseYamlFile, fileExists } from '../yaml/parser.js';
import { writeYamlFile, backupYamlFile } from '../yaml/writer.js';
import { validateDocument } from '../yaml/validator.js';
import { loadConfig } from '../config/config-manager.js';
import { getAdoClient } from '../ado/client.js';
import { pullWorkItems } from '../core/sync-engine.js';
import { success, error as logError, warn, info } from '../utils/logger.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { colors, formatId } from '../utils/colors.js';
import { renderTable } from '../utils/table.js';

/**
 * Execute pull command
 */
export async function pullCommand(
  file: string,
  options: PullOptions
): Promise<void> {
  // Check file exists
  if (!(await fileExists(file))) {
    logError(`File not found: ${file}`);
    process.exit(1);
  }

  // Parse and validate
  startSpinner('Reading YAML file...');
  let doc;
  try {
    doc = await parseYamlFile(file);
    const validation = validateDocument(doc);
    if (!validation.valid) {
      failSpinner('Validation failed');
      for (const error of validation.errors) {
        logError(`  ${error.path}: ${error.message}`);
      }
      process.exit(1);
    }
    succeedSpinner('YAML file loaded');
  } catch (err) {
    failSpinner('Failed to read file');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }

  // Load config
  const config = await loadConfig({
    organization: doc.project.organization,
    project: doc.project.project,
  });

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

  // Create backup before making changes
  try {
    const backupPath = await backupYamlFile(file);
    info(`Backup created: ${colors.dim(backupPath)}`);
  } catch {
    warn('Could not create backup file');
  }

  // Pull work items
  startSpinner('Pulling from Azure DevOps...');
  try {
    const results = await pullWorkItems(client, doc, config, {
      includeComments: options.includeComments,
      includePRs: options.includePRs,
      includeHistory: options.includeHistory,
      overwriteLocal: options.overwriteLocal,
    });

    succeedSpinner('Pull completed');

    // Display results
    console.log('');
    displayResults(results);

    // Save updated YAML
    await writeYamlFile(file, doc);
    info(`\nUpdated ${colors.bold(file)}`);

    // Summary
    const updated = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('');
    success(`Summary: ${updated} updated, ${failed} failed`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    failSpinner('Pull failed');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }
}

/**
 * Display pull results
 */
function displayResults(results: Array<{
  localId: string;
  action: string;
  success: boolean;
  workItemId?: number;
  message?: string;
  error?: string;
}>): void {
  const tableData = results.map(r => ({
    id: r.localId,
    status: r.success ? colors.success('✓') : colors.error('✗'),
    adoId: r.workItemId ? formatId(r.workItemId, '#') : colors.dim('-'),
    message: r.error ?? r.message ?? '',
  }));

  const table = renderTable(tableData, {
    columns: [
      { header: 'Local ID', key: 'id', width: 20 },
      { header: '', key: 'status', width: 3 },
      { header: 'ADO ID', key: 'adoId', width: 10 },
      { header: 'Message', key: 'message', width: 60 },
    ],
  });

  console.log(table);
}
