/**
 * Logger utility using consola
 */

import { consola, createConsola } from 'consola';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

// Create logger instance
const logger = createConsola({
  level: getLogLevelNumber(process.env['ADO_SYNC_LOG_LEVEL'] as LogLevel ?? 'info'),
});

function getLogLevelNumber(level: LogLevel): number {
  const levels: Record<LogLevel, number> = {
    debug: 4,
    info: 3,
    warn: 2,
    error: 1,
    silent: 0,
  };
  return levels[level] ?? 3;
}

export function setLogLevel(level: LogLevel): void {
  logger.level = getLogLevelNumber(level);
}

export function debug(message: string, ...args: unknown[]): void {
  logger.debug(message, ...args);
}

export function info(message: string, ...args: unknown[]): void {
  logger.info(message, ...args);
}

export function success(message: string, ...args: unknown[]): void {
  logger.success(message, ...args);
}

export function warn(message: string, ...args: unknown[]): void {
  logger.warn(message, ...args);
}

export function error(message: string, ...args: unknown[]): void {
  logger.error(message, ...args);
}

export function box(message: string): void {
  logger.box(message);
}

export { logger };
