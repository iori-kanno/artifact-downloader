#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../config/index.js';
import { AppStoreConnectProvider } from '../providers/app-store-connect.js';
import { FirebaseAppDistributionProvider } from '../providers/firebase-app-distribution.js';
import { setDebugMode } from '../utils/debug.js';

const program = new Command();

interface AuthCheckResult {
  provider: string;
  configExists: boolean;
  configValid: boolean;
  connectionTest: boolean;
  permissions: boolean;
  errors: string[];
  warnings: string[];
  details: {
    endpoint?: string;
    credentialsUsed?: string[];
    permissionsChecked?: string[];
    productsFound?: number;
  };
}

program
  .name('auth-check')
  .description('Check authentication configuration and connectivity')
  .option('--from <provider>', 'Check specific provider (app-store-connect, app-distribution, or all)', validateProvider, 'all')
  .option('--verbose', 'Show detailed information')
  .option('--debug', 'Enable debug logging')
  .action(executeAuthCheck);

export async function executeAuthCheck(options: any): Promise<void> {
  if (options.debug) {
    setDebugMode(true);
  }

  const spinner = ora('Checking authentication configuration...').start();
  
  try {
    const configManager = new ConfigManager();
    await configManager.load();

    const results: AuthCheckResult[] = [];

    if (options.from === 'all' || options.from === 'app-store-connect') {
      const result = await checkAppStoreConnect(configManager, options.verbose);
      results.push(result);
    }

    if (options.from === 'all' || options.from === 'app-distribution') {
      const result = await checkFirebaseAppDistribution(configManager, options.verbose);
      results.push(result);
    }

    spinner.stop();

    // Display results
    displayResults(results, options.verbose);

    // Exit with error if any critical issues found
    const hasCriticalErrors = results.some(r => !r.configExists || !r.configValid || !r.connectionTest);
    if (hasCriticalErrors) {
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Authentication check failed');
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

async function checkAppStoreConnect(configManager: ConfigManager, verbose: boolean): Promise<AuthCheckResult> {
  const result: AuthCheckResult = {
    provider: 'App Store Connect',
    configExists: false,
    configValid: false,
    connectionTest: false,
    permissions: false,
    errors: [],
    warnings: [],
    details: {}
  };

  try {
    // Check if config exists
    result.configExists = configManager.validateAppStoreConnectConfig();
    
    if (!result.configExists) {
      result.errors.push('Configuration missing or incomplete');
      const missingVars = [];
      if (!process.env.APPSTORE_KEY_ID && !configManager.getAppStoreConnectConfig()?.keyId) {
        missingVars.push('APPSTORE_KEY_ID');
      }
      if (!process.env.APPSTORE_ISSUER_ID && !configManager.getAppStoreConnectConfig()?.issuerId) {
        missingVars.push('APPSTORE_ISSUER_ID');
      }
      if (!process.env.APPSTORE_PRIVATE_KEY_PATH && !configManager.getAppStoreConnectConfig()?.privateKeyPath) {
        missingVars.push('APPSTORE_PRIVATE_KEY_PATH');
      }
      if (missingVars.length > 0) {
        result.errors.push(`Missing: ${missingVars.join(', ')}`);
      }
      return result;
    }

    result.configValid = true;

    // Add configuration details for verbose output
    const config = configManager.getAppStoreConnectConfig()!;
    result.details.credentialsUsed = [
      `Key ID: ${config.keyId || process.env.APPSTORE_KEY_ID}`,
      `Issuer ID: ${config.issuerId || process.env.APPSTORE_ISSUER_ID}`,
      `Private Key: ${config.privateKeyPath || process.env.APPSTORE_PRIVATE_KEY_PATH}`
    ];
    result.details.endpoint = 'https://api.appstoreconnect.apple.com';
    result.details.permissionsChecked = ['Xcode Cloud product listing', 'API access'];

    // Test connection and permissions
    try {
      const provider = new AppStoreConnectProvider(config);
      
      // Try to list products (this tests both connection and permissions)
      const products = await provider.listProducts();
      result.connectionTest = true;
      result.permissions = true;
      result.details.productsFound = products.length;

      if (products.length === 0) {
        result.warnings.push('No Xcode Cloud products found - this may be normal if no products are configured');
      } else if (verbose) {
        result.warnings.push(`Found ${products.length} Xcode Cloud product(s): ${products.map(p => p.name).join(', ')}`);
      }

    } catch (error: any) {
      result.connectionTest = false;
      result.permissions = false;
      
      if (error.response?.status === 401) {
        result.errors.push('Authentication failed - check credentials');
      } else if (error.response?.status === 403) {
        result.errors.push('Permission denied - check API key permissions');
      } else if (error.code === 'ENOENT') {
        result.errors.push('Private key file not found');
      } else {
        result.errors.push(`Connection test failed: ${error.message}`);
      }
    }

  } catch (error: any) {
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  return result;
}

async function checkFirebaseAppDistribution(configManager: ConfigManager, verbose: boolean): Promise<AuthCheckResult> {
  const result: AuthCheckResult = {
    provider: 'Firebase App Distribution',
    configExists: false,
    configValid: false,
    connectionTest: false,
    permissions: false,
    errors: [],
    warnings: [],
    details: {}
  };

  try {
    // Check if config exists
    result.configExists = configManager.validateFirebaseConfig();
    
    if (!result.configExists) {
      result.errors.push('Configuration missing or incomplete');
      const missingVars = [];
      if (!process.env.FIREBASE_PROJECT_ID && !configManager.getFirebaseConfig()?.projectId) {
        missingVars.push('FIREBASE_PROJECT_ID');
      }
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !configManager.getFirebaseConfig()?.serviceAccountPath) {
        missingVars.push('FIREBASE_SERVICE_ACCOUNT_PATH');
      }
      if (missingVars.length > 0) {
        result.errors.push(`Missing: ${missingVars.join(', ')}`);
      }
      return result;
    }

    result.configValid = true;

    // Add configuration details for verbose output
    const config = configManager.getFirebaseConfig()!;
    result.details.credentialsUsed = [
      `Project ID: ${config.projectId || process.env.FIREBASE_PROJECT_ID}`,
      `Service Account: ${config.serviceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH}`
    ];
    result.details.endpoint = 'https://firebase.googleapis.com';
    result.details.permissionsChecked = ['Firebase project access', 'App Distribution API', 'App listing'];

    // Test connection and permissions
    try {
      const provider = new FirebaseAppDistributionProvider(config);
      
      // Try to list products (this tests both connection and permissions)
      const products = await provider.listProducts();
      result.connectionTest = true;
      result.permissions = true;
      result.details.productsFound = products.length;

      if (products.length === 0) {
        result.warnings.push('No Firebase apps found - check project ID and permissions');
      } else if (verbose) {
        const appNames = products.map(p => `${p.name} (${p.platform})`).join(', ');
        result.warnings.push(`Found ${products.length} Firebase app(s): ${appNames}`);
      }

    } catch (error: any) {
      result.connectionTest = false;
      result.permissions = false;
      
      if (error.response?.status === 401) {
        result.errors.push('Authentication failed - check service account credentials');
      } else if (error.response?.status === 403) {
        result.errors.push('Permission denied - check service account permissions');
      } else if (error.response?.status === 404) {
        result.errors.push('Project not found - check project ID');
      } else if (error.code === 'ENOENT') {
        result.errors.push('Service account file not found');
      } else {
        result.errors.push(`Connection test failed: ${error.message}`);
      }
    }

  } catch (error: any) {
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  return result;
}

function displayResults(results: AuthCheckResult[], verbose: boolean): void {
  console.log(chalk.bold('\n🔐 Authentication Check Results\n'));

  let overallStatus = true;

  for (const result of results) {
    const hasErrors = result.errors.length > 0;
    
    if (hasErrors) {
      overallStatus = false;
    }

    // Provider header
    const statusIcon = result.connectionTest ? '✅' : (hasErrors ? '❌' : '⚠️');
    console.log(`${statusIcon} ${chalk.bold(result.provider)}`);

    // Configuration status
    console.log(`   Config exists: ${result.configExists ? chalk.green('Yes') : chalk.red('No')}`);
    if (result.configExists) {
      console.log(`   Config valid: ${result.configValid ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`   Connection: ${result.connectionTest ? chalk.green('Success') : chalk.red('Failed')}`);
      console.log(`   Permissions: ${result.permissions ? chalk.green('OK') : chalk.red('Limited/Failed')}`);
    }

    // Show errors
    if (result.errors.length > 0) {
      console.log(chalk.red('   Errors:'));
      result.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
    }

    // Show detailed information in verbose mode
    if (verbose && result.details) {
      if (result.details.endpoint) {
        console.log(chalk.gray(`   Endpoint: ${result.details.endpoint}`));
      }
      if (result.details.credentialsUsed && result.details.credentialsUsed.length > 0) {
        console.log(chalk.gray('   Credentials used:'));
        result.details.credentialsUsed.forEach(cred => {
          console.log(chalk.gray(`   • ${cred}`));
        });
      }
      if (result.details.permissionsChecked && result.details.permissionsChecked.length > 0) {
        console.log(chalk.gray('   Permissions tested:'));
        result.details.permissionsChecked.forEach(perm => {
          console.log(chalk.gray(`   • ${perm}`));
        });
      }
      if (result.details.productsFound !== undefined) {
        console.log(chalk.gray(`   Products discovered: ${result.details.productsFound}`));
      }
    }

    // Show warnings (only if verbose or if there are no errors)
    if (result.warnings.length > 0 && (verbose || result.errors.length === 0)) {
      console.log(chalk.yellow('   Notes:'));
      result.warnings.forEach(warning => {
        console.log(chalk.yellow(`   • ${warning}`));
      });
    }

    console.log(); // Empty line between providers
  }

  // Overall summary
  if (overallStatus) {
    console.log(chalk.green('✨ All authentication configurations are working properly!'));
  } else {
    console.log(chalk.red('⚠️  Some authentication configurations have issues. Please check the errors above.'));
  }

  if (!verbose) {
    console.log(chalk.gray('\nRun with --verbose for more detailed information'));
  }
}

function validateProvider(value: string): string {
  const validProviders = ['app-store-connect', 'app-distribution', 'all'];
  if (!validProviders.includes(value)) {
    throw new Error(`Invalid provider. Must be one of: ${validProviders.join(', ')}`);
  }
  return value;
}

// Only parse when run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}