import { readFile, access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { debug } from '../utils/debug.js';
import type { Config, AppStoreConnectConfig, FirebaseConfig } from '../types/index.js';

export class ConfigManager {
  private config: Config = {};
  
  constructor() {
    dotenvConfig();
  }

  async load(): Promise<Config> {
    // 1. Load from environment variables
    this.loadFromEnv();
    
    // 2. Load from config files (override env vars)
    await this.loadFromFile();
    
    return this.config;
  }

  private loadFromEnv(): void {
    debug('Loading configuration from environment variables');
    
    // App Store Connect
    if (process.env.APPSTORE_KEY_ID || process.env.APPSTORE_ISSUER_ID || process.env.APPSTORE_PRIVATE_KEY_PATH) {
      this.config.appStoreConnect = {
        keyId: process.env.APPSTORE_KEY_ID || '',
        issuerId: process.env.APPSTORE_ISSUER_ID || '',
        privateKeyPath: process.env.APPSTORE_PRIVATE_KEY_PATH || '',
      };
      debug('Loaded App Store Connect config from env', {
        keyId: this.config.appStoreConnect.keyId ? '***' : '(not set)',
        issuerId: this.config.appStoreConnect.issuerId ? '***' : '(not set)',
        privateKeyPath: this.config.appStoreConnect.privateKeyPath ? '***' : '(not set)',
      });
    }

    // Firebase
    if (process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      this.config.firebase = {
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
      };
    }
  }

  private async loadFromFile(): Promise<void> {
    const configPaths = [
      './config.json',
      './config.local.json',
      './.artifact-downloader/config.json',
      join(homedir(), '.artifact-downloader', 'config.json'),
    ];

    for (const configPath of configPaths) {
      try {
        await access(configPath, constants.R_OK);
        debug(`Checking config file: ${configPath}`);
        const content = await readFile(configPath, 'utf-8');
        const fileConfig = JSON.parse(content) as Config;
        
        debug(`Loaded config from ${configPath}`, {
          hasAppStoreConnect: !!fileConfig.appStoreConnect,
          hasFirebase: !!fileConfig.firebase,
        });
        
        // Merge with existing config (file config takes precedence)
        this.config = this.mergeConfig(this.config, fileConfig);
      } catch {
        // File doesn't exist or isn't readable, skip
        debug(`Config file not found or not readable: ${configPath}`);
      }
    }
  }

  private mergeConfig(base: Config, override: Config): Config {
    return {
      appStoreConnect: override.appStoreConnect || base.appStoreConnect,
      firebase: override.firebase || base.firebase,
    };
  }

  getAppStoreConnectConfig(): AppStoreConnectConfig | undefined {
    return this.config.appStoreConnect;
  }

  getFirebaseConfig(): FirebaseConfig | undefined {
    return this.config.firebase;
  }

  validateAppStoreConnectConfig(): boolean {
    const config = this.config.appStoreConnect;
    return !!(config?.keyId && config?.issuerId && config?.privateKeyPath);
  }

  validateFirebaseConfig(): boolean {
    const config = this.config.firebase;
    return !!(config?.projectId && config?.serviceAccountPath);
  }
}