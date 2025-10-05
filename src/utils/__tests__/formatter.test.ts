import { formatArtifacts, formatFileSize, formatDate, formatShortDate } from '../formatter.js';
import type { Artifact } from '../../types/index.js';

describe('formatFileSize', () => {
  test('formats bytes correctly', () => {
    expect(formatFileSize(0)).toBe('-');
    expect(formatFileSize(512)).toBe('512.00 B');
    expect(formatFileSize(1024)).toBe('1.00 KB');
    expect(formatFileSize(1536)).toBe('1.50 KB');
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(1572864)).toBe('1.50 MB');
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
    expect(formatFileSize(1610612736)).toBe('1.50 GB');
  });

  test('handles edge cases', () => {
    expect(formatFileSize(0)).toBe('-');
    expect(formatFileSize(1023)).toBe('1023.00 B');
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.00 KB');
  });

  test('rounds to 2 decimal places', () => {
    expect(formatFileSize(1234)).toBe('1.21 KB');
    expect(formatFileSize(1234567)).toBe('1.18 MB');
  });
});

describe('formatDate', () => {
  test('formats date with full information', () => {
    const date = new Date('2023-12-25T15:30:45');
    const formatted = formatDate(date);
    
    // Note: The exact format may vary based on locale, but should include all components
    expect(formatted).toMatch(/Dec/);
    expect(formatted).toMatch(/25/);
    expect(formatted).toMatch(/2023/);
    expect(formatted).toMatch(/3:30/); // Can be 03:30 or 3:30 depending on locale
  });
});

describe('formatShortDate', () => {
  test('formats date without year', () => {
    const date = new Date('2023-12-25T15:30:45');
    const formatted = formatShortDate(date);
    
    expect(formatted).toMatch(/Dec/);
    expect(formatted).toMatch(/25/);
    expect(formatted).not.toMatch(/2023/);
    expect(formatted).toMatch(/3:30/); // Can be 03:30 or 3:30 depending on locale
  });
});

describe('formatArtifacts', () => {
  const mockArtifacts: Artifact[] = [
    {
      id: '1',
      version: '1.0.0',
      buildNumber: '100',
      artifactType: 'ad_hoc',
      fileName: 'app-adhoc.ipa',
      fileSize: 50 * 1024 * 1024, // 50MB
      uploadedAt: new Date('2023-12-25T10:00:00'),
      downloadUrl: 'https://example.com/download/1',
      provider: 'app-store-connect',
    },
    {
      id: '2',
      version: '1.0.1',
      buildNumber: '101',
      artifactType: 'app_store',
      fileName: 'very-long-file-name-that-should-be-truncated-because-it-is-too-long.ipa',
      fileSize: 0, // No size available
      uploadedAt: new Date('2023-12-26T14:30:00'),
      downloadUrl: 'https://example.com/download/2',
      provider: 'app-store-connect',
    },
  ];

  test('formats artifacts as JSON', () => {
    const result = formatArtifacts(mockArtifacts, 'json');
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveLength(2);
    expect(parsed[0].version).toBe('1.0.0');
    expect(parsed[0].buildNumber).toBe('100');
    expect(parsed[1].version).toBe('1.0.1');
  });

  test('formats artifacts as table', () => {
    const result = formatArtifacts(mockArtifacts, 'table');
    
    // Check that table contains expected data
    expect(result).toContain('1.0.0');
    expect(result).toContain('100');
    expect(result).toContain('ad_hoc');
    expect(result).toContain('app-adhoc.ipa');
    expect(result).toContain('50.00 MB');
    
    // Check second artifact
    expect(result).toContain('1.0.1');
    expect(result).toContain('101');
    expect(result).toContain('app_store');
    
    // Long filename should be truncated with ...
    expect(result).toContain('...');
    expect(result).not.toContain('very-long-file-name-that-should-be-truncated-because-it-is-too-long.ipa');
    
    // File size 0 should show as -
    expect(result).toMatch(/\s-\s/); // "-" surrounded by spaces
  });

  test('handles empty artifact list', () => {
    const jsonResult = formatArtifacts([], 'json');
    expect(jsonResult).toBe('[]');
    
    const tableResult = formatArtifacts([], 'table');
    // Table should have headers but no data rows
    expect(tableResult).toContain('Ver');
    expect(tableResult).toContain('Build');
    expect(tableResult).toContain('Type');
  });

  test('truncates long filenames correctly', () => {
    const longFileArtifact: Artifact = {
      id: '3',
      version: '1.0.0',
      buildNumber: '100',
      artifactType: 'ipa',
      fileName: 'a'.repeat(50) + '.ipa', // 54 chars total
      fileSize: 1024,
      uploadedAt: new Date(),
      downloadUrl: 'https://example.com/download/3',
      provider: 'app-store-connect',
    };

    const result = formatArtifacts([longFileArtifact], 'table');
    
    // Should be truncated to 35 chars + ...
    expect(result).toContain('a'.repeat(35) + '...');
    expect(result).not.toContain('a'.repeat(50));
  });
});