export interface ArtifactProvider {
  readonly name: string;
  search(options: SearchOptions): Promise<Artifact[]>;
  getById(id: string): Promise<Artifact | null>;
  download(artifact: Artifact, outputPath: string): Promise<void>;
  listProducts?(): Promise<Array<{ id: string; name: string; platform?: string }>>;
}

export interface SearchOptions {
  appId: string;
  limit?: number;
  version?: string;
  buildNumber?: string;
  artifactType?: string;
}

export interface DownloadOptions {
  appId: string;
  version: string;
  buildNumber?: string;
  artifactType?: string;
  outputPath: string;
  from: 'app-store-connect' | 'app-distribution';
}

export interface Artifact {
  id: string;
  version: string;
  buildNumber: string;
  artifactType: string;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  downloadUrl?: string;
  provider: string;
}

export interface AppStoreConnectConfig {
  keyId: string;
  issuerId: string;
  privateKeyPath: string;
}

export interface FirebaseConfig {
  projectId: string;
  serviceAccountPath: string;
}

export interface Config {
  appStoreConnect?: AppStoreConnectConfig;
  firebase?: FirebaseConfig;
}

export interface ParsedVersion {
  version: string;
  buildNumber?: string;
}

export type OutputFormat = 'table' | 'json';