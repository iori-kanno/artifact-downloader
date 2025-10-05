import type { ParsedVersion } from '../types/index.js';

export function parseVersion(versionString: string): ParsedVersion {
  // Remove 'v' prefix if present
  const normalizedVersion = versionString.startsWith('v') 
    ? versionString.substring(1) 
    : versionString;

  // Pattern 1: version+buildNumber (e.g., "1.0.0+20")
  const plusPattern = /^(\d+\.\d+\.\d+)\+(\d+)$/;
  const plusMatch = normalizedVersion.match(plusPattern);
  if (plusMatch) {
    return {
      version: plusMatch[1],
      buildNumber: plusMatch[2],
    };
  }

  // Pattern 2: version(buildNumber) (e.g., "1.0.0(20)")
  const parenPattern = /^(\d+\.\d+\.\d+)\((\d+)\)$/;
  const parenMatch = normalizedVersion.match(parenPattern);
  if (parenMatch) {
    return {
      version: parenMatch[1],
      buildNumber: parenMatch[2],
    };
  }

  // Pattern 3: just version (e.g., "1.0.0")
  const versionOnlyPattern = /^(\d+\.\d+\.\d+)$/;
  const versionMatch = normalizedVersion.match(versionOnlyPattern);
  if (versionMatch) {
    return {
      version: versionMatch[1],
    };
  }

  // If no pattern matches, return the original string as version
  return {
    version: normalizedVersion,
  };
}

export function formatVersion(version: string, buildNumber?: string): string {
  if (buildNumber) {
    return `${version}+${buildNumber}`;
  }
  return version;
}