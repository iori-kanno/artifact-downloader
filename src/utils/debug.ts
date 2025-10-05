import chalk from 'chalk';

let debugMode = false;

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

export function isDebugMode(): boolean {
  return debugMode;
}

export function debug(message: string, data?: unknown): void {
  if (debugMode) {
    console.log(chalk.gray('[DEBUG]'), message);
    if (data !== undefined) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
}