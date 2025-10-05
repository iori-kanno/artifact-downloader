import Table from 'cli-table3';
import chalk from 'chalk';
import type { Artifact, OutputFormat } from '../types/index.js';

export function formatArtifacts(artifacts: Artifact[], format: OutputFormat): string {
  if (format === 'json') {
    return JSON.stringify(artifacts, null, 2);
  }

  // Table format
  const table = new Table({
    head: [
      chalk.cyan('Ver'),
      chalk.cyan('Build'),
      chalk.cyan('Type'),
      chalk.cyan('File'),
      chalk.cyan('Size'),
      chalk.cyan('Date'),
    ],
    style: {
      head: [],
      border: [],
    },
    colWidths: [8, 7, 13, 40, 10, 15], // Fixed column widths
    wordWrap: true,
  });

  artifacts.forEach((artifact) => {
    // Shorten filename if too long
    let fileName = artifact.fileName;
    if (fileName.length > 38) {
      fileName = fileName.substring(0, 35) + '...';
    }
    
    table.push([
      artifact.version,
      artifact.buildNumber,
      artifact.artifactType,
      fileName,
      formatFileSize(artifact.fileSize),
      formatShortDate(artifact.uploadedAt),
    ]);
  });

  return table.toString();
}

export function formatFileSize(bytes: number): string {
  // If file size is 0 or not available, show "-"
  if (bytes === 0) {
    return '-';
  }
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}