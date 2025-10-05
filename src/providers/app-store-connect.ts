import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import axios, { AxiosInstance } from 'axios';
import { debug } from '../utils/debug.js';
import type { ArtifactProvider, SearchOptions, Artifact, AppStoreConnectConfig } from '../types/index.js';

interface XcodeCloudProduct {
  id: string;
  attributes: {
    name: string;
  };
}


interface BuildAction {
  id: string;
  attributes: {
    actionType: string;
    name: string;
  };
}


export class AppStoreConnectProvider implements ArtifactProvider {
  readonly name = 'app-store-connect';
  private config: AppStoreConnectConfig;
  private client: AxiosInstance;
  private privateKey: string | null = null;

  constructor(config: AppStoreConnectConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: 'https://api.appstoreconnect.apple.com/v1',
    });
  }

  private async loadPrivateKey(): Promise<string> {
    if (!this.privateKey) {
      this.privateKey = await readFile(this.config.privateKeyPath, 'utf-8');
    }
    return this.privateKey;
  }

  private async generateToken(): Promise<string> {
    const privateKey = await this.loadPrivateKey();
    
    const payload = {
      iss: this.config.issuerId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 20 * 60, // 20 minutes
      aud: 'appstoreconnect-v1',
    };

    return jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      keyid: this.config.keyId,
    });
  }

  private async request(url: string, params?: Record<string, unknown>): Promise<unknown> {
    const token = await this.generateToken();
    
    try {
      const fullUrl = `${this.client.defaults.baseURL}${url}`;
      debug('Request URL:', fullUrl);
      debug('Request params:', params);
      
      const response = await this.client.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params,
      });

      debug('Response status:', response.status);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        debug('API Error:', error.response.status);
        debug('Error data:', error.response.data);
        debug('Request URL:', error.config?.url);
        debug('Request params:', error.config?.params);
      }
      throw error;
    }
  }

  async listProducts(): Promise<Array<{ id: string; name: string; platform?: string }>> {
    try {
      const productsData = await this.request('/ciProducts', {
        'filter[productType]': 'APP',
      }) as { data: XcodeCloudProduct[] };
      
      debug('Products data response:', productsData);
      
      if (!productsData.data || !Array.isArray(productsData.data)) {
        debug('No products data found in response');
        return [];
      }
      
      return productsData.data.map(p => ({
        id: p.id,
        name: p.attributes.name,
        platform: 'ios'
      }));
    } catch (error) {
      debug('Error in listProducts:', error);
      throw error;
    }
  }

  async search(options: SearchOptions): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];
    
    // 1. Find the product by bundle ID
    const productsData = await this.request('/ciProducts', {
      'filter[productType]': 'APP',
    }) as { data: XcodeCloudProduct[] };
    
    const product = productsData.data.find((p: XcodeCloudProduct) => 
      p.attributes.name === options.appId
    );
    
    if (!product) {
      const availableProducts = productsData.data.map((p: XcodeCloudProduct) => p.attributes.name);
      throw new Error(
        `Product "${options.appId}" not found in Xcode Cloud.\n` +
        `Note: For App Store Connect, use the Xcode Cloud product name (usually your repository name), not the bundle ID.\n` +
        `Available products: ${availableProducts.length > 0 ? availableProducts.join(', ') : 'none'}`
      );
    }

    // 2. Get build runs
    // Request more build runs than needed to ensure we get enough artifacts after filtering
    const buildRunLimit = Math.max((options.limit || 3) * 3, 20); // Get 3x more buildRuns to account for filtering
    const buildRunsData = await this.request(`/ciProducts/${product.id}/buildRuns`, {
      limit: buildRunLimit,
      sort: '-number',  // Use build number for sorting instead of createdDate
    }) as { data: Array<{ id: string; attributes: { number: number; createdDate: string } }> };

    // 3. Process each build run
    for (const buildRun of buildRunsData.data) {
      const buildNumber = buildRun.attributes.number.toString();
      
      // Skip if specific build number is requested and doesn't match
      if (options.buildNumber && buildNumber !== options.buildNumber) {
        continue;
      }

      // Get build actions
      const actionsData = await this.request(`/ciBuildRuns/${buildRun.id}/actions`) as { data: BuildAction[] };
      
      // Find archive actions
      const archiveActions = actionsData.data.filter((action: BuildAction) => 
        action.attributes.actionType === 'ARCHIVE'
      );

      for (const action of archiveActions) {
        // Get artifacts for this action
        const artifactsData = await this.request(`/ciBuildActions/${action.id}/artifacts`) as { 
          data: Array<{ id: string; attributes: { fileName: string; fileSize: number } }> 
        };
        
        for (const artifact of artifactsData.data) {
          const fileName = artifact.attributes.fileName;
          
          // Determine artifact type from filename first
          let artifactType = 'archive';
          const lowerFileName = fileName.toLowerCase();
          
          if (lowerFileName.includes('development')) {
            artifactType = 'development';
          } else if (lowerFileName.includes('ad-hoc') || lowerFileName.includes('ad_hoc')) {
            artifactType = 'ad_hoc';
          } else if (lowerFileName.includes('app-store') || lowerFileName.includes('app_store')) {
            artifactType = 'app_store';
          } else if (lowerFileName.includes('logs')) {
            artifactType = 'logs';
          } else if (lowerFileName.includes('xcresult') || lowerFileName.includes('.xcresult')) {
            artifactType = 'xcresult';
          } else if (lowerFileName.includes('.xcarchive')) {
            artifactType = 'xcarchive';
          } else if (lowerFileName.endsWith('.ipa')) {
            artifactType = 'ipa';
          }

          // Special handling: development, ad_hoc, and app_store types are essentially IPA files
          const ipaTypes = ['development', 'ad_hoc', 'app_store'];

          // Filter by artifact type if specified
          // Special case: 'ipa' matches development, ad_hoc, and app_store types
          if (options.artifactType) {
            if (options.artifactType === 'ipa' && ipaTypes.includes(artifactType)) {
              // Allow ipa to match any iOS distribution type
            } else if (artifactType !== options.artifactType) {
              continue;
            }
          }

          // Extract version from filename (e.g., "MyApp 3.10.0 development.zip" -> "3.10.0")
          let version = 'unknown';
          const versionMatch = fileName.match(/(\d+\.\d+\.\d+)/);
          if (versionMatch) {
            version = versionMatch[1];
          } else {
            // For files without version in filename (logs, xcresult, xcarchive),
            // try to get version from other artifacts in the same build
            // For now, keep as 'unknown' since it's technically correct
            version = 'unknown';
          }
          
          artifacts.push({
            id: artifact.id,
            version: options.version || version,
            buildNumber,
            artifactType,
            fileName,
            fileSize: artifact.attributes.fileSize,
            uploadedAt: new Date(buildRun.attributes.createdDate),
            provider: this.name,
          });

          // Check if we've reached the limit
          if (artifacts.length >= (options.limit || 3)) {
            return artifacts.slice(0, options.limit || 3);
          }
        }
      }
    }

    return artifacts;
  }

  async getById(id: string): Promise<Artifact | null> {
    try {
      // Get artifact details directly by ID (without include parameter)
      const artifactData = await this.request(`/ciArtifacts/${id}`) as {
        data: { 
          id: string;
          attributes: { 
            fileName: string; 
            fileSize: number;
          };
        }
      };

      debug('Artifact data response:', artifactData);

      const fileName = artifactData.data.attributes.fileName;
      
      // Since we can't get build run info directly, we need to extract build number from filename or use search
      // Try to extract build number from filename patterns like "Build 393" or similar
      let buildNumber = 'unknown';
      
      // Look for patterns like "Build 393" or "3.11.0 ad-hoc" where we might infer from context
      const buildMatch = fileName.match(/Build (\d+)/i);
      if (buildMatch) {
        buildNumber = buildMatch[1];
      } else {
        // As a fallback, use default build number since we can't extract from filename
        debug('Could not extract build number from filename, using default');
        buildNumber = '0';
      }

      // Determine artifact type from filename
      let artifactType = 'archive';
      const lowerFileName = fileName.toLowerCase();
      
      if (lowerFileName.includes('development')) {
        artifactType = 'development';
      } else if (lowerFileName.includes('ad-hoc') || lowerFileName.includes('ad_hoc')) {
        artifactType = 'ad_hoc';
      } else if (lowerFileName.includes('app-store') || lowerFileName.includes('app_store')) {
        artifactType = 'app_store';
      } else if (lowerFileName.includes('logs')) {
        artifactType = 'logs';
      } else if (lowerFileName.includes('xcresult') || lowerFileName.includes('.xcresult')) {
        artifactType = 'xcresult';
      } else if (lowerFileName.includes('.xcarchive')) {
        artifactType = 'xcarchive';
      } else if (lowerFileName.endsWith('.ipa')) {
        artifactType = 'ipa';
      }

      // Extract version from filename
      let version = 'unknown';
      const versionMatch = fileName.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        version = versionMatch[1];
      }

      const result = {
        id: artifactData.data.id,
        version,
        buildNumber,
        artifactType,
        fileName,
        fileSize: artifactData.data.attributes.fileSize,
        uploadedAt: new Date(), // We don't have exact timestamp, use current time
        provider: this.name,
      };

      debug('Returning artifact:', result);
      return result;
    } catch (error) {
      // If artifact not found or any error, return null
      debug('Error in getById:', error);
      return null;
    }
  }

  async download(artifact: Artifact, outputPath: string): Promise<void> {
    // Get the download URL
    const artifactData = await this.request(`/ciArtifacts/${artifact.id}`) as {
      data: { attributes: { downloadUrl?: string } }
    };
    const downloadUrl = artifactData.data.attributes.downloadUrl;
    
    if (!downloadUrl) {
      throw new Error('Download URL not available');
    }

    // Download the file
    const response = await axios.get(downloadUrl, {
      responseType: 'stream',
    });

    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    
    await pipeline(response.data, createWriteStream(outputPath));
  }
}