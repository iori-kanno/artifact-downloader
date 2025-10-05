#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get version
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('artifacts-cli')
  .description('CLI tool to download artifacts from Xcode Cloud and Firebase App Distribution')
  .version(packageJson.version);

// Search command (with aliases list, ls)
program
  .command('search')
  .alias('list')
  .alias('ls')
  .description('Search for artifacts in App Store Connect or Firebase App Distribution')
  .requiredOption('--app-id <id>', 'App identifier (Xcode Cloud product name for app-store-connect, Bundle/Package ID for app-distribution)')
  .requiredOption('--from <provider>', 'Provider to search from (app-store-connect, app-distribution)', validateProvider)
  .option('--limit <number>', 'Maximum number of results', '3')
  .option('--version <version>', 'Filter by version')
  .option('--build-number <number>', 'Filter by build number')
  .option('--artifact-type <type>', 'Filter by artifact type (e.g., ad_hoc, app_store, ipa, apk, aab)')
  .option('--format <format>', 'Output format (table, json)', validateFormat, 'table')
  .option('--debug', 'Enable debug logging')
  .action(async (options) => {
    // Import and execute search-artifacts logic
    const { executeSearch } = await import('./search-artifacts.js');
    await executeSearch(options);
  });

// Download command (with alias dl)
program
  .command('download')
  .alias('dl')
  .description('Download artifacts from App Store Connect or Firebase App Distribution')
  .argument('<version-or-id>', 'Version to download (e.g., v1.0.0+20, "1.0.0(20)"), artifact ID, or "latest" for most recent')
  .requiredOption('--app-id <id>', 'App identifier (Xcode Cloud product name for app-store-connect, Bundle/Package ID for app-distribution)')
  .requiredOption('--from <provider>', 'Provider to download from (app-store-connect, app-distribution)', validateProvider)
  .option('--output <path>', 'Output directory or file path', './downloads')
  .option('--artifact-type <type>', 'Artifact type to download (e.g., ad_hoc, app_store, ipa, apk, aab)')
  .option('--debug', 'Enable debug logging')
  .action(async (versionOrId, options) => {
    // Import and execute download-artifacts logic
    const { executeDownload } = await import('./download-artifacts.js');
    await executeDownload(versionOrId, options);
  });

// List products command (with alias search-products)
program
  .command('list-products')
  .alias('search-products')
  .description('List available products from App Store Connect and/or Firebase App Distribution')
  .option('--from <provider>', 'Provider to list from (app-store-connect, app-distribution, or all)', validateListProvider, 'all')
  .option('--platform <platform>', 'Filter by platform (ios, android, or all)', validatePlatform, 'all')
  .option('--format <format>', 'Output format (table, json)', validateFormat, 'table')
  .option('--debug', 'Enable debug logging')
  .action(async (options) => {
    // Import and execute list-products logic
    const { executeListProducts } = await import('./list-products.js');
    await executeListProducts(options);
  });

// Auth check command
program
  .command('auth-check')
  .description('Check authentication configuration and connectivity')
  .option('--from <provider>', 'Check specific provider (app-store-connect, app-distribution, or all)', validateListProvider, 'all')
  .option('--verbose', 'Show detailed information')
  .option('--debug', 'Enable debug logging')
  .action(async (options) => {
    // Import and execute auth-check logic
    const { executeAuthCheck } = await import('./auth-check.js');
    await executeAuthCheck(options);
  });

// Validation functions
function validateProvider(value: string): string {
  const validProviders = ['app-store-connect', 'app-distribution'];
  if (!validProviders.includes(value)) {
    throw new Error(`Invalid provider. Must be one of: ${validProviders.join(', ')}`);
  }
  return value;
}

function validateListProvider(value: string): string {
  const validProviders = ['app-store-connect', 'app-distribution', 'all'];
  if (!validProviders.includes(value)) {
    throw new Error(`Invalid provider. Must be one of: ${validProviders.join(', ')}`);
  }
  return value;
}

function validatePlatform(value: string): string {
  const validPlatforms = ['ios', 'android', 'all'];
  if (!validPlatforms.includes(value)) {
    throw new Error(`Invalid platform. Must be one of: ${validPlatforms.join(', ')}`);
  }
  return value;
}

function validateFormat(value: string): string {
  const validFormats = ['table', 'json'];
  if (!validFormats.includes(value)) {
    throw new Error(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
  }
  return value;
}

// Show help if no command is provided
program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}