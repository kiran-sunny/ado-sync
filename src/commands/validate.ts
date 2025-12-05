/**
 * Validate Command - Validate YAML file against schema
 */

import type { ValidateOptions } from '../types/config.js';
import { parseYamlFile, fileExists } from '../yaml/parser.js';
import { validateDocument, validateAdoConsistency } from '../yaml/validator.js';
import { success, error as logError, warn, info } from '../utils/logger.js';
import { colors } from '../utils/colors.js';

/**
 * Execute validate command
 */
export async function validateCommand(
  file: string,
  options: ValidateOptions
): Promise<void> {
  // Check file exists
  if (!(await fileExists(file))) {
    logError(`File not found: ${file}`);
    process.exit(1);
  }

  info(`Validating ${colors.bold(file)}...`);

  try {
    // Parse YAML
    const doc = await parseYamlFile(file);

    // Validate against schema
    const result = validateDocument(doc);

    // Additional ADO consistency checks
    const adoWarnings = validateAdoConsistency(doc);
    result.warnings.push(...adoWarnings);

    // Display errors
    if (result.errors.length > 0) {
      logError(`\n${colors.error('Validation errors:')}`);
      for (const error of result.errors) {
        logError(`  ${colors.dim(error.path)}: ${error.message}`);
      }
    }

    // Display warnings
    if (result.warnings.length > 0) {
      warn(`\n${colors.warning('Warnings:')}`);
      for (const warning of result.warnings) {
        warn(`  ${colors.dim(warning.path)}: ${warning.message}`);
      }
    }

    // Summary
    console.log('');
    if (result.valid) {
      success('Validation passed!');

      // Show summary
      info(`  Schema version: ${doc.schemaVersion}`);
      info(`  Hierarchy type: ${doc.hierarchyType}`);
      info(`  Organization: ${doc.project.organization}`);
      info(`  Project: ${doc.project.project}`);
      info(`  Work items: ${countItems(doc.workItems)}`);

      if (result.warnings.length > 0 && options.strict) {
        warn('\nStrict mode: failing due to warnings');
        process.exit(1);
      }
    } else {
      logError('Validation failed!');
      process.exit(1);
    }

    // Check ADO configuration if requested
    if (options.checkAdo) {
      await checkAdoConfiguration(doc);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Failed to validate: ${message}`);
    process.exit(1);
  }
}

/**
 * Count items recursively
 */
function countItems(items: Array<{ children?: unknown[] }>): number {
  let count = 0;
  for (const item of items) {
    count++;
    if (item.children && Array.isArray(item.children)) {
      count += countItems(item.children as Array<{ children?: unknown[] }>);
    }
  }
  return count;
}

/**
 * Check ADO configuration
 */
async function checkAdoConfiguration(doc: { project: { organization: string; project: string } }): Promise<void> {
  info('\nChecking Azure DevOps configuration...');

  // Import dynamically to avoid circular dependencies
  const { getAdoClient } = await import('../ado/client.js');
  const { getPat } = await import('../config/credentials.js');

  const pat = await getPat(doc.project.organization);
  if (!pat) {
    warn('No PAT found. Set ADO_PAT environment variable.');
    return;
  }

  try {
    const client = getAdoClient({
      organization: doc.project.organization,
      project: doc.project.project,
    });

    const connected = await client.testConnection();
    if (connected) {
      success('Successfully connected to Azure DevOps');
    } else {
      warn('Could not verify Azure DevOps connection');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Azure DevOps connection failed: ${message}`);
  }
}
