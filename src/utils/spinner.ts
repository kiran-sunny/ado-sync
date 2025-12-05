/**
 * Spinner utility using ora
 */

import ora, { type Ora } from 'ora';

let currentSpinner: Ora | null = null;

export function startSpinner(text: string): Ora {
  // Stop any existing spinner
  if (currentSpinner) {
    currentSpinner.stop();
  }

  currentSpinner = ora({
    text,
    spinner: 'dots',
  }).start();

  return currentSpinner;
}

export function updateSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = text;
  }
}

export function succeedSpinner(text?: string): void {
  if (currentSpinner) {
    currentSpinner.succeed(text);
    currentSpinner = null;
  }
}

export function failSpinner(text?: string): void {
  if (currentSpinner) {
    currentSpinner.fail(text);
    currentSpinner = null;
  }
}

export function warnSpinner(text?: string): void {
  if (currentSpinner) {
    currentSpinner.warn(text);
    currentSpinner = null;
  }
}

export function stopSpinner(): void {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

export function getSpinner(): Ora | null {
  return currentSpinner;
}

/**
 * Create a standalone spinner (doesn't affect global spinner)
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    spinner: 'dots',
  });
}
