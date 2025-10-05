#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../config/index.js';
import { AppStoreConnectProvider } from '../providers/app-store-connect.js';
import { FirebaseAppDistributionProvider } from '../providers/firebase-app-distribution.js';
import { formatArtifacts } from '../utils/formatter.js';
import { setDebugMode } from '../utils/debug.js';
import type { SearchOptions, OutputFormat } from '../types/index.js';

const program = new Command();

program
  .name('search-artifacts')
  .description('Search for artifacts in App Store Connect or Firebase App Distribution')
  .requiredOption('--app-id <id>', 'App identifier (Xcode Cloud product name for app-store-connect, Bundle/Package ID for app-distribution)')
  .requiredOption('--from <provider>', 'Provider to search from (app-store-connect, app-distribution)', validateProvider)
  .option('--limit <number>', 'Maximum number of results', '3')
  .option('--version <version>', 'Filter by version')
  .option('--build-number <number>', 'Filter by build number')
  .option('--artifact-type <type>', 'Filter by artifact type (e.g., ad_hoc, app_store, ipa, apk, aab)')
  .option('--format <format>', 'Output format (table, json)', validateFormat, 'table')
  .option('--debug', 'Enable debug logging')
  .action(executeSearch);

export async function executeSearch(options: any): Promise<void> {
    if (options.debug) {
      setDebugMode(true);
    }
    const spinner = ora('Loading configuration...').start();

    try {
      // Load configuration
      const configManager = new ConfigManager();
      await configManager.load();

      // Initialize provider
      let provider;
      if (options.from === 'app-store-connect') {
        if (!configManager.validateAppStoreConnectConfig()) {
          spinner.fail('App Store Connect configuration is missing or incomplete');
          console.error(chalk.red('\nRequired environment variables or config:'));
          console.error('- APPSTORE_KEY_ID');
          console.error('- APPSTORE_ISSUER_ID');
          console.error('- APPSTORE_PRIVATE_KEY_PATH');
          process.exit(1);
        }
        provider = new AppStoreConnectProvider(configManager.getAppStoreConnectConfig()!);
      } else {
        if (!configManager.validateFirebaseConfig()) {
          spinner.fail('Firebase configuration is missing or incomplete');
          console.error(chalk.red('\nRequired environment variables or config:'));
          console.error('- FIREBASE_PROJECT_ID');
          console.error('- FIREBASE_SERVICE_ACCOUNT_PATH');
          process.exit(1);
        }
        provider = new FirebaseAppDistributionProvider(configManager.getFirebaseConfig()!);
      }

      // Search for artifacts
      spinner.text = 'Searching for artifacts...';
      
      const searchOptions: SearchOptions = {
        appId: options.appId,
        limit: parseInt(options.limit),
        version: options.version,
        buildNumber: options.buildNumber,
        artifactType: options.artifactType,
      };

      const artifacts = await provider.search(searchOptions);
      
      spinner.stop();

      if (artifacts.length === 0) {
        console.log(chalk.yellow('No artifacts found matching the criteria'));
        return;
      }

      // Format and output results
      const output = formatArtifacts(artifacts, options.format as OutputFormat);
      console.log(output);
      
      // Only show summary for table format, not JSON
      if (options.format !== 'json') {
        console.log(chalk.green(`\nFound ${artifacts.length} artifact(s)`));
      }
    } catch (error) {
      spinner.fail('Search failed');
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
}

function validateProvider(value: string): string {
  const validProviders = ['app-store-connect', 'app-distribution'];
  if (!validProviders.includes(value)) {
    throw new Error(`Invalid provider. Must be one of: ${validProviders.join(', ')}`);
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

// Only parse when run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}