/**
 * Push Command - Push work items to Azure DevOps
 */

import type { PushOptions } from '../types/config.js';
import { parseYamlFile, fileExists } from '../yaml/parser.js';
import { writeYamlFile, backupYamlFile } from '../yaml/writer.js';
import { validateDocument } from '../yaml/validator.js';
import { loadConfig } from '../config/config-manager.js';
import { getAdoClient } from '../ado/client.js';
import { pushWorkItems } from '../core/sync-engine.js';
import { success, error as logError, warn, info } from '../utils/logger.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { colors, formatAction, formatType, formatId } from '../utils/colors.js';
import { renderTable } from '../utils/table.js';

/**
 * Execute push command
 */
export async function pushCommand(
  file: string,
  options: PushOptions
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

  // Dry run notice
  if (options.dryRun) {
    warn('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Create backup before making changes
  if (!options.dryRun) {
    try {
      const backupPath = await backupYamlFile(file);
      info(`Backup created: ${colors.dim(backupPath)}`);
    } catch {
      warn('Could not create backup file');
    }
  }

  // Push work items
  startSpinner('Pushing work items...');
  try {
    const results = await pushWorkItems(client, doc, config, {
      dryRun: options.dryRun,
      force: options.force,
      createOnly: options.createOnly,
      updateOnly: options.updateOnly,
      filter: options.filter,
    });

    succeedSpinner('Push completed');

    // Display results
    console.log('');
    displayResults(results);

    // Save updated YAML with new metadata
    if (!options.dryRun) {
      await writeYamlFile(file, doc);
      info(`\nUpdated ${colors.bold(file)} with sync metadata`);
    }

    // Summary
    const created = results.filter(r => r.action === 'create' && r.success).length;
    const updated = results.filter(r => r.action === 'update' && r.success).length;
    const skipped = results.filter(r => r.action === 'skip').length;
    const failed = results.filter(r => !r.success).length;
    const conflicts = results.filter(r => r.action === 'conflict').length;

    console.log('');
    success(`Summary: ${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed, ${conflicts} conflicts`);

    if (failed > 0 || conflicts > 0) {
      process.exit(1);
    }
  } catch (err) {
    failSpinner('Push failed');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }
}

/**
 * Display push results
 */
function displayResults(results: Array<{
  localId: string;
  action: string;
  success: boolean;
  workItemId?: number;
  url?: string;
  message?: string;
  error?: string;
}>): void {
  const tableData = results.map(r => ({
    id: r.localId,
    action: formatAction(r.action),
    status: r.success ? colors.success('✓') : colors.error('✗'),
    adoId: r.workItemId ? formatId(r.workItemId, '#') : colors.dim('-'),
    message: r.error ?? r.message ?? '',
  }));

  const table = renderTable(tableData, {
    columns: [
      { header: 'Local ID', key: 'id', width: 20 },
      { header: 'Action', key: 'action', width: 10 },
      { header: '', key: 'status', width: 3 },
      { header: 'ADO ID', key: 'adoId', width: 10 },
      { header: 'Message', key: 'message', width: 50 },
    ],
  });

  console.log(table);
}
