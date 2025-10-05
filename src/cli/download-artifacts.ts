#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ConfigManager } from '../config/index.js';
import { AppStoreConnectProvider } from '../providers/app-store-connect.js';
import { FirebaseAppDistributionProvider } from '../providers/firebase-app-distribution.js';
import { parseVersion } from '../utils/version-parser.js';
import { formatFileSize } from '../utils/formatter.js';
import { setDebugMode } from '../utils/debug.js';
import type { SearchOptions, Artifact } from '../types/index.js';

const program = new Command();

program
  .name('download-artifacts')
  .description('Download artifacts from App Store Connect or Firebase App Distribution')
  .argument('<version-or-id>', 'Version to download (e.g., v1.0.0+20, "1.0.0(20)"), artifact ID, or "latest" for most recent')
  .requiredOption('--app-id <id>', 'App identifier (Xcode Cloud product name for app-store-connect, Bundle/Package ID for app-distribution)')
  .requiredOption('--from <provider>', 'Provider to download from (app-store-connect, app-distribution)', validateProvider)
  .option('--output <path>', 'Output directory or file path', './downloads')
  .option('--artifact-type <type>', 'Artifact type to download (e.g., ad_hoc, app_store, ipa, apk, aab)')
  .option('--debug', 'Enable debug logging')
  .action(executeDownload);

export async function executeDownload(versionOrId: string, options: any): Promise<void> {
    if (options.debug) {
      setDebugMode(true);
    }
    const spinner = ora('Loading configuration...').start();

    try {
      // Check if input is "latest", artifact ID, or version string
      const isLatest = versionOrId.toLowerCase() === 'latest';
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionOrId);
      const isFirebaseId = /^[0-9a-z]{13}$/i.test(versionOrId); // Firebase IDs are 13 character alphanumeric
      const isArtifactId = isUuid || isFirebaseId;
      
      let version: string | undefined;
      let buildNumber: string | undefined;
      
      if (!isLatest && !isArtifactId) {
        // Parse as version
        const parsed = parseVersion(versionOrId);
        version = parsed.version;
        buildNumber = parsed.buildNumber;
      }
      
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

      let artifact;
      
      if (isLatest) {
        // Get the latest artifact
        spinner.text = 'Searching for latest artifact...';
        
        if (options.from === 'app-store-connect' && !options.artifactType) {
          // For App Store Connect without artifact type, show interactive selection
          spinner.text = 'Searching for available artifact types...';
          
          const searchOptions: SearchOptions = {
            appId: options.appId,
            limit: 10, // Get more to find different types
          };

          const allArtifacts = await provider.search(searchOptions);
          
          if (allArtifacts.length === 0) {
            spinner.fail('No artifacts found');
            console.error(chalk.red(`\nNo artifacts found for app ${options.appId}`));
            process.exit(1);
          }

          // Group artifacts by type and get the latest of each type
          const artifactsByType = new Map<string, Artifact>();
          for (const artifact of allArtifacts) {
            if (!artifactsByType.has(artifact.artifactType)) {
              artifactsByType.set(artifact.artifactType, artifact);
            }
          }

          if (artifactsByType.size === 1) {
            // Only one type available, use it
            artifact = Array.from(artifactsByType.values())[0];
          } else {
            // Multiple types available, let user choose
            spinner.stop();
            
            const choices = Array.from(artifactsByType.entries()).map(([type, artifact]) => ({
              name: `${type} - ${artifact.version} (${artifact.buildNumber}) - ${artifact.fileName}`,
              value: artifact,
              short: type
            }));

            const { selectedArtifact } = await inquirer.prompt([
              {
                type: 'list',
                name: 'selectedArtifact',
                message: 'Multiple artifact types found. Which one would you like to download?',
                choices,
                pageSize: 10
              }
            ]);

            artifact = selectedArtifact;
          }
        } else {
          // Firebase or App Store Connect with specific artifact type
          const searchOptions: SearchOptions = {
            appId: options.appId,
            artifactType: options.artifactType,
            limit: 1, // Only get the most recent
          };

          const artifacts = await provider.search(searchOptions);
          
          if (artifacts.length === 0) {
            spinner.fail('No artifacts found');
            console.error(chalk.red(`\nNo artifacts found for app ${options.appId}`));
            if (options.artifactType) {
              console.error(chalk.yellow(`Try without --artifact-type filter or check if ${options.artifactType} artifacts exist`));
            }
            process.exit(1);
          }

          artifact = artifacts[0]; // Most recent artifact
        }
      } else if (isArtifactId) {
        // Search for artifact by ID using the provided appId
        spinner.text = 'Searching for artifact by ID...';
        
        const searchOptions: SearchOptions = {
          appId: options.appId,
          limit: 50, // Search more to find the specific artifact
        };

        const artifacts = await provider.search(searchOptions);
        artifact = artifacts.find(a => a.id === versionOrId);
        
        if (!artifact) {
          spinner.fail('Artifact not found');
          console.error(chalk.red(`\nArtifact with ID ${versionOrId} not found in app ${options.appId}`));
          console.error(chalk.yellow('Note: The artifact ID must belong to the specified app'));
          process.exit(1);
        }
      } else {
        // Search by version
        spinner.text = 'Searching for matching artifacts...';
        
        const searchOptions: SearchOptions = {
          appId: options.appId,
          version,
          buildNumber,
          artifactType: options.artifactType,
          limit: 1,
        };

        const artifacts = await provider.search(searchOptions);
        
        if (artifacts.length === 0) {
          spinner.fail('No artifacts found matching the criteria');
          console.error(chalk.red(`\nNo artifacts found for version ${versionOrId}`));
          if (!buildNumber) {
            console.error(chalk.yellow('Hint: Try specifying a build number (e.g., v1.0.0+20)'));
          }
          process.exit(1);
        }

        artifact = artifacts[0];
      }
      
      // Prepare output path
      let outputPath = options.output;
      if (!outputPath.endsWith(artifact.fileName)) {
        // If output is a directory, append the filename
        outputPath = join(outputPath, artifact.fileName);
      }

      // Create directory if needed
      await mkdir(dirname(outputPath), { recursive: true });

      // Download the artifact
      spinner.text = `Downloading ${artifact.fileName}...`;
      await provider.download(artifact, outputPath);
      
      spinner.succeed('Download complete');
      
      console.log(chalk.green(`\nArtifact downloaded successfully!`));
      console.log(`Version: ${chalk.cyan(artifact.version)}`);
      console.log(`Build: ${chalk.cyan(artifact.buildNumber)}`);
      console.log(`Type: ${chalk.cyan(artifact.artifactType)}`);
      console.log(`File: ${chalk.cyan(outputPath)}`);
      if (artifact.fileSize > 0) {
        console.log(`Size: ${chalk.cyan(formatFileSize(artifact.fileSize))}`);
      }
    } catch (error) {
      spinner.fail('Download failed');
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

// Only parse when run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}