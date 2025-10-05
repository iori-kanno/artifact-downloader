import axios, { AxiosInstance } from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { debug } from '../utils/debug.js';
import type { ArtifactProvider, SearchOptions, Artifact, FirebaseConfig } from '../types/index.js';

interface FirebaseApp {
  name: string;
  appId: string;
  projectId: string;
  bundleId?: string;
  packageName?: string;
}

export class FirebaseAppDistributionProvider implements ArtifactProvider {
  readonly name = 'app-distribution';
  private config: FirebaseConfig;
  private client: AxiosInstance;
  private auth: GoogleAuth;

  constructor(config: FirebaseConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: 'https://firebaseappdistribution.googleapis.com/v1',
    });

    this.auth = new GoogleAuth({
      keyFile: config.serviceAccountPath,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform'
      ],
    });
  }

  private async getAccessToken(): Promise<string> {
    const authClient = await this.auth.getClient();
    const response = await authClient.getAccessToken();
    if (!response.token) {
      throw new Error('Failed to get access token');
    }
    return response.token;
  }

  private async request(url: string, params?: Record<string, unknown>): Promise<unknown> {
    const token = await this.getAccessToken();
    
    const response = await this.client.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params,
    });

    return response.data;
  }

  private async findApp(bundleIdOrPackageId: string): Promise<FirebaseApp | null> {
    debug('Finding app by bundle ID or package name:', bundleIdOrPackageId);
    
    const token = await this.getAccessToken();
    const managementClient = axios.create({
      baseURL: 'https://firebase.googleapis.com/v1beta1'
    });

    try {
      // Search in Android apps
      debug('Searching in Android apps...');
      const androidResponse = await managementClient.get(`/projects/${this.config.projectId}/androidApps`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (androidResponse.data.apps) {
        const androidApp = androidResponse.data.apps.find((app: any) => 
          app.packageName === bundleIdOrPackageId || app.appId === bundleIdOrPackageId
        );
        if (androidApp) {
          debug('Found Android app:', androidApp);
          return {
            ...androidApp,
            projectId: this.config.projectId
          };
        }
      }
    } catch (error) {
      debug('Error searching Android apps:', error);
    }

    try {
      // Search in iOS apps
      debug('Searching in iOS apps...');
      const iosResponse = await managementClient.get(`/projects/${this.config.projectId}/iosApps`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (iosResponse.data.apps) {
        const iosApp = iosResponse.data.apps.find((app: any) => 
          app.bundleId === bundleIdOrPackageId || app.appId === bundleIdOrPackageId
        );
        if (iosApp) {
          debug('Found iOS app:', iosApp);
          return {
            ...iosApp,
            projectId: this.config.projectId
          };
        }
      }
    } catch (error) {
      debug('Error searching iOS apps:', error);
    }

    debug('App not found');
    return null;
  }

  private determineArtifactType(app: FirebaseApp, fileName?: string): string {
    // For iOS apps
    if (app.bundleId) {
      return 'ipa';
    }
    
    // For Android apps, determine from file extension or default to apk
    if (app.packageName) {
      if (fileName) {
        if (fileName.endsWith('.apk')) return 'apk';
        if (fileName.endsWith('.aab')) return 'aab';
      }
      // Default to apk for Android apps
      return 'apk';
    }

    return 'unknown';
  }

  async search(options: SearchOptions): Promise<Artifact[]> {
    try {
      debug('Starting Firebase search for appId:', options.appId);
      const artifacts: Artifact[] = [];

      // Find the app
      debug('Finding app by identifier:', options.appId);
      const app = await this.findApp(options.appId);
      if (!app) {
        throw new Error(`App with ID ${options.appId} not found`);
      }
      debug('Found app:', app);

      // Get releases
      debug('Fetching releases for app:', app.appId);
      
      // Extract project number from app ID (e.g., "1:405368879324:android:..." -> "405368879324")
      const projectNumber = app.appId.split(':')[1];
      if (!projectNumber) {
        throw new Error(`Could not extract project number from app ID: ${app.appId}`);
      }
      debug('Extracted project number:', projectNumber);
      
      const requestUrl = `/projects/${projectNumber}/apps/${app.appId}/releases`;
      debug('Request URL:', requestUrl);
      
      const releasesData = await this.request(requestUrl, {
        pageSize: 50,  // Get many more releases to account for filtering
      }
    ) as { releases?: Array<{
      name: string;
      displayVersion: string;
      buildVersion: string;
      createTime: string;
    }> };

    const releases = releasesData.releases || [];
    debug('Raw releases from Firebase API:', releases);

    for (const release of releases) {
      debug(`Processing release - displayVersion: ${release.displayVersion}, buildVersion: ${release.buildVersion}`);
      debug(`Version filter: ${options.version}, Build filter: ${options.buildNumber}`);
      const buildNumber = release.buildVersion;
      
      // Skip if specific build number is requested and doesn't match
      if (options.buildNumber && buildNumber !== options.buildNumber) {
        continue;
      }

      // Skip if specific version is requested and doesn't match
      if (options.version && release.displayVersion !== options.version) {
        continue;
      }

      // Extract release ID from the name
      const releaseId = release.name.split('/').pop() || '';
      const fileName = `${app.bundleId || app.packageName}_${release.displayVersion}_${buildNumber}`;
      const artifactType = this.determineArtifactType(app);

      // Skip if specific artifact type is requested and doesn't match
      if (options.artifactType && artifactType !== options.artifactType) {
        continue;
      }

      artifacts.push({
        id: releaseId,
        version: release.displayVersion,
        buildNumber,
        artifactType,
        fileName: fileName + (artifactType === 'ipa' ? '.ipa' : artifactType === 'aab' ? '.aab' : '.apk'),
        fileSize: 0, // Firebase API doesn't provide file size in list
        uploadedAt: new Date(release.createTime),
        provider: this.name,
      });

      // Check if we've reached the user's requested limit
      if (artifacts.length >= (options.limit || 3)) {
        break;
      }
    }

    debug('Found artifacts:', artifacts);
    return artifacts.slice(0, options.limit || 3);
    } catch (error) {
      debug('Error in Firebase search:', error);
      throw error;
    }
  }

  async listProducts(): Promise<Array<{ id: string; name: string; platform?: string }>> {
    try {
      debug('Fetching Firebase apps for project:', this.config.projectId);
      
      const allApps: Array<{ id: string; name: string; platform?: string }> = [];
      const token = await this.getAccessToken();
      
      // For listProducts, we need to use Firebase Management API with a different base URL
      const managementClient = axios.create({
        baseURL: 'https://firebase.googleapis.com/v1beta1'
      });
      
      // Fetch Android apps
      try {
        debug('Fetching Android apps...');
        const androidResponse = await managementClient.get(`/projects/${this.config.projectId}/androidApps`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        debug('Android apps response:', androidResponse.data);
        
        if (androidResponse.data.apps) {
          androidResponse.data.apps.forEach((app: any) => {
            allApps.push({
              id: app.packageName || app.appId,
              name: app.displayName,
              platform: 'android'
            });
          });
        }
      } catch (androidError) {
        debug('Error fetching Android apps:', androidError);
      }
      
      // Fetch iOS apps  
      try {
        debug('Fetching iOS apps...');
        const iosResponse = await managementClient.get(`/projects/${this.config.projectId}/iosApps`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        debug('iOS apps response:', iosResponse.data);
        
        if (iosResponse.data.apps) {
          iosResponse.data.apps.forEach((app: any) => {
            allApps.push({
              id: app.bundleId || app.appId,
              name: app.displayName,
              platform: 'ios'
            });
          });
        }
      } catch (iosError) {
        debug('Error fetching iOS apps:', iosError);
      }
      
      debug('All Firebase apps:', allApps);
      return allApps;
    } catch (error) {
      debug('Error in Firebase listProducts:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<Artifact | null> {
    try {
      // For Firebase, we need to search through apps to find the release
      // This is not as efficient as App Store Connect, but Firebase API doesn't provide direct release access by ID
      
      // First get the list of apps to find project numbers
      const allApps: FirebaseApp[] = [];
      const token = await this.getAccessToken();
      
      const managementClient = axios.create({
        baseURL: 'https://firebase.googleapis.com/v1beta1'
      });
      
      // Get Android apps
      try {
        const androidResponse = await managementClient.get(`/projects/${this.config.projectId}/androidApps`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (androidResponse.data.apps) {
          androidResponse.data.apps.forEach((app: any) => {
            allApps.push({
              ...app,
              projectId: this.config.projectId
            });
          });
        }
      } catch (error) {
        debug('Error fetching Android apps for getById:', error);
      }
      
      // Get iOS apps
      try {
        const iosResponse = await managementClient.get(`/projects/${this.config.projectId}/iosApps`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (iosResponse.data.apps) {
          iosResponse.data.apps.forEach((app: any) => {
            allApps.push({
              ...app,
              projectId: this.config.projectId
            });
          });
        }
      } catch (error) {
        debug('Error fetching iOS apps for getById:', error);
      }

      if (allApps.length === 0) {
        return null;
      }

      // Search through all apps to find the release
      for (const app of allApps) {
        try {
          // Extract project number from app ID
          const projectNumber = app.appId.split(':')[1];
          if (!projectNumber) {
            debug(`Could not extract project number from app ID: ${app.appId}`);
            continue;
          }
          
          const releaseData = await this.request(`/projects/${projectNumber}/apps/${app.appId}/releases/${id}`) as {
            name?: string;
            displayVersion: string;
            buildVersion: string;
            createTime: string;
          };

          if (releaseData.name) {
            const buildNumber = releaseData.buildVersion;
            const fileName = `${app.bundleId || app.packageName}_${releaseData.displayVersion}_${buildNumber}`;
            
            // Create FirebaseApp compatible object for determineArtifactType
            const firebaseApp: FirebaseApp = {
              ...app,
              projectId: this.config.projectId
            };
            const artifactType = this.determineArtifactType(firebaseApp);

            return {
              id,
              version: releaseData.displayVersion,
              buildNumber,
              artifactType,
              fileName,
              fileSize: 0, // Firebase doesn't provide file size in release details
              uploadedAt: new Date(releaseData.createTime),
              provider: this.name,
            };
          }
        } catch (error) {
          // Continue to next app if release not found in this app
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async download(artifact: Artifact, outputPath: string): Promise<void> {
    // Find the app again to get the full app ID
    const app = await this.findApp(artifact.fileName.split('_')[0]);
    if (!app) {
      throw new Error('App not found');
    }

    // Get the release details with download URL
    // Extract project number from app ID
    const projectNumber = app.appId.split(':')[1];
    if (!projectNumber) {
      throw new Error(`Could not extract project number from app ID: ${app.appId}`);
    }
    
    const releaseName = `projects/${projectNumber}/apps/${app.appId}/releases/${artifact.id}`;
    const releaseData = await this.request(`/${releaseName}`) as { binaryDownloadUri?: string };
    
    if (!releaseData.binaryDownloadUri) {
      throw new Error('Download URL not available');
    }

    // Download the file
    const token = await this.getAccessToken();
    const response = await axios.get(releaseData.binaryDownloadUri, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      responseType: 'stream',
    });

    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    
    await pipeline(response.data, createWriteStream(outputPath));
  }
}