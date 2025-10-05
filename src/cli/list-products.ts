#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { ConfigManager } from '../config/index.js';
import { AppStoreConnectProvider } from '../providers/app-store-connect.js';
import { FirebaseAppDistributionProvider } from '../providers/firebase-app-distribution.js';
import { setDebugMode } from '../utils/debug.js';

const program = new Command();

program
  .name('list-products')
  .description('List available products from App Store Connect and/or Firebase App Distribution')
  .option('--from <provider>', 'Provider to list from (app-store-connect, app-distribution, or all)', validateProvider, 'all')
  .option('--platform <platform>', 'Filter by platform (ios, android, or all)', validatePlatform, 'all')
  .option('--format <format>', 'Output format (table, json)', validateFormat, 'table')
  .option('--debug', 'Enable debug logging')
  .action(executeListProducts);

export async function executeListProducts(options: any): Promise<void> {
    if (options.debug) {
      setDebugMode(true);
    }
    const spinner = ora('Loading configuration...').start();

    try {
      // Load configuration
      const configManager = new ConfigManager();
      await configManager.load();
      
      // Debug configuration status
      if (options.debug) {
        console.log('\n[DEBUG] Configuration validation:');
        console.log('- App Store Connect:', configManager.validateAppStoreConnectConfig() ? 'Valid' : 'Invalid');
        console.log('- Firebase:', configManager.validateFirebaseConfig() ? 'Valid' : 'Invalid');
        if (configManager.validateFirebaseConfig()) {
          console.log('- Firebase Config:', configManager.getFirebaseConfig());
        }
      }

      const allProducts: Array<{ id: string; name: string; platform?: string; provider: string }> = [];
      const warnings: string[] = [];

      // Check App Store Connect
      if (options.from === 'all' || options.from === 'app-store-connect') {
        if (configManager.validateAppStoreConnectConfig()) {
          try {
            spinner.text = 'Fetching Xcode Cloud products...';
            const provider = new AppStoreConnectProvider(configManager.getAppStoreConnectConfig()!);
            const products = await provider.listProducts();
            products.forEach(p => allProducts.push({ ...p, provider: 'App Store Connect' }));
          } catch (error) {
            if (options.from === 'app-store-connect') {
              // If specifically requested App Store Connect, fail completely
              throw error;
            } else {
              // If requesting all, just warn and continue
              warnings.push(`Failed to fetch from App Store Connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        } else if (options.from === 'app-store-connect') {
          spinner.fail('App Store Connect configuration is missing or incomplete');
          console.error(chalk.red('\nRequired environment variables or config:'));
          console.error('- APPSTORE_KEY_ID');
          console.error('- APPSTORE_ISSUER_ID');
          console.error('- APPSTORE_PRIVATE_KEY_PATH');
          process.exit(1);
        }
      }

      // Check Firebase App Distribution
      if (options.from === 'all' || options.from === 'app-distribution') {
        if (configManager.validateFirebaseConfig()) {
          try {
            spinner.text = 'Fetching Firebase apps...';
            const provider = new FirebaseAppDistributionProvider(configManager.getFirebaseConfig()!);
            const products = await provider.listProducts();
            products.forEach(p => allProducts.push({ ...p, provider: 'Firebase App Distribution' }));
          } catch (error) {
            if (options.from === 'app-distribution') {
              // If specifically requested Firebase, fail completely
              throw error;
            } else {
              // If requesting all, just warn and continue
              warnings.push(`Failed to fetch from Firebase App Distribution: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        } else if (options.from === 'app-distribution') {
          spinner.fail('Firebase configuration is missing or incomplete');
          console.error(chalk.red('\nRequired environment variables or config:'));
          console.error('- FIREBASE_PROJECT_ID');
          console.error('- FIREBASE_SERVICE_ACCOUNT_PATH');
          process.exit(1);
        }
      }
      
      spinner.stop();
      
      // Apply platform filter
      let filteredProducts = allProducts;
      if (options.platform && options.platform !== 'all') {
        filteredProducts = allProducts.filter(product => 
          product.platform === options.platform
        );
      }
      
      if (filteredProducts.length === 0) {
        if (options.format === 'json') {
          console.log('[]');
        } else {
          console.log(chalk.yellow('No products found'));
          if (options.from === 'all') {
            console.log(chalk.gray('Make sure at least one provider is properly configured'));
          }
          if (options.platform !== 'all') {
            console.log(chalk.gray(`No products found for platform: ${options.platform}`));
          }
        }
        return;
      }

      if (options.format === 'json') {
        // JSON format
        console.log(JSON.stringify(filteredProducts, null, 2));
      } else {
        // Table format (default)
        const table = new Table({
          head: [chalk.cyan('Product Name'), chalk.cyan('Product ID'), chalk.cyan('Platform'), chalk.cyan('Provider')],
          style: { head: [], border: [] },
        });

        filteredProducts.forEach((product) => {
          table.push([
            product.name, 
            product.id, 
            product.platform || 'unknown',
            product.provider
          ]);
        });

        console.log('\n' + chalk.bold('Available Products:'));
        console.log(table.toString());
        console.log(chalk.gray('\nUse the Product Name (for App Store Connect) or Product ID (for Firebase) as --app-id when searching or downloading artifacts'));
        
        // Show warnings after the table
        if (warnings.length > 0) {
          console.log('\n' + chalk.bold('Warnings:'));
          warnings.forEach(warning => {
            console.log(chalk.yellow(`⚠ ${warning}`));
          });
        }
      }
    } catch (error) {
      spinner.fail('Failed to fetch products');
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
}

function validateProvider(value: string): string {
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

// Only parse when run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}