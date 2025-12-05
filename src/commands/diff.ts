/**
 * Diff Command - Show differences between YAML and ADO
 */

import type { DiffOptions } from '../types/config.js';
import { parseYamlFile, fileExists } from '../yaml/parser.js';
import { validateDocument } from '../yaml/validator.js';
import { loadConfig } from '../config/config-manager.js';
import { getAdoClient } from '../ado/client.js';
import { getWorkItems } from '../ado/work-items.js';
import { flattenHierarchy } from '../core/hierarchy.js';
import { diffDocument, getDiffSummary, formatFieldChange } from '../core/diff-engine.js';
import { success, error as logError, info } from '../utils/logger.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { colors, formatStatus, formatType, formatId } from '../utils/colors.js';
import { renderTable } from '../utils/table.js';

/**
 * Execute diff command
 */
export async function diffCommand(
  file: string,
  options: DiffOptions
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
      process.exit(1);
    }
    succeedSpinner(`Connected to ${config.organization}/${config.project}`);
  } catch (err) {
    failSpinner('Connection failed');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }

  // Fetch ADO items
  startSpinner('Fetching work items from ADO...');
  try {
    const items = flattenHierarchy(doc);
    const adoIds = items
      .map(item => item._ado?.workItemId)
      .filter((id): id is number => id !== null && id !== undefined);

    const adoItems = adoIds.length > 0 ? await getWorkItems(client, adoIds, 'None') : [];
    const adoMap = new Map(adoItems.map(item => [item.id, item]));

    succeedSpinner(`Fetched ${adoItems.length} items from ADO`);

    // Calculate diffs
    const diffs = diffDocument(doc, adoMap);
    const summary = getDiffSummary(diffs);

    // Output based on format
    console.log('');
    if (options.format === 'json') {
      console.log(JSON.stringify({ diffs, summary }, null, 2));
    } else if (options.format === 'yaml') {
      const yaml = await import('js-yaml');
      console.log(yaml.dump({ diffs, summary }));
    } else {
      displayDiffTable(diffs);
      displaySummary(summary);
    }
  } catch (err) {
    failSpinner('Failed to fetch items');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }
}

/**
 * Display diff as table
 */
function displayDiffTable(diffs: Array<{
  localId: string;
  adoId?: number;
  status: string;
  changes: Array<{ field: string; localValue: unknown; adoValue: unknown }>;
}>): void {
  // Filter out unchanged items
  const changedDiffs = diffs.filter(d => d.status !== 'unchanged');

  if (changedDiffs.length === 0) {
    success('No differences found - YAML and ADO are in sync');
    return;
  }

  const tableData = changedDiffs.map(d => ({
    id: d.localId,
    adoId: d.adoId ? formatId(d.adoId, '#') : colors.dim('-'),
    status: formatStatus(d.status),
    changes: d.changes.length > 0
      ? d.changes.map(c => formatFieldChange(c)).join('\n')
      : colors.dim('(no field changes)'),
  }));

  const table = renderTable(tableData, {
    columns: [
      { header: 'Local ID', key: 'id', width: 20 },
      { header: 'ADO ID', key: 'adoId', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Changes', key: 'changes', width: 50 },
    ],
  });

  console.log(table);

  // Show detailed changes for modified items
  const modified = changedDiffs.filter(d => d.status === 'modified' || d.status === 'conflict');
  if (modified.length > 0) {
    console.log('\n' + colors.bold('Detailed Changes:'));
    for (const diff of modified) {
      console.log(`\n${colors.info(diff.localId)} ${diff.adoId ? `(#${diff.adoId})` : ''}:`);
      for (const change of diff.changes) {
        console.log(`  ${formatFieldChange(change)}`);
      }
    }
  }
}

/**
 * Display summary
 */
function displaySummary(summary: {
  new: number;
  modified: number;
  unchanged: number;
  conflict: number;
  deleted: number;
}): void {
  console.log('\n' + colors.bold('Summary:'));
  info(`  ${colors.new(`${summary.new} new`)}`);
  info(`  ${colors.modified(`${summary.modified} modified`)}`);
  info(`  ${colors.synced(`${summary.unchanged} unchanged`)}`);
  if (summary.conflict > 0) {
    info(`  ${colors.conflict(`${summary.conflict} conflicts`)}`);
  }
  if (summary.deleted > 0) {
    info(`  ${colors.deleted(`${summary.deleted} deleted`)}`);
  }
}
