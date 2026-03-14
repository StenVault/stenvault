/**
 * Format Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatTimeRemaining,
  formatSpeed,
} from './format';

describe('formatBytes', () => {
  it('should format zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B');
    expect(formatBytes(1023)).toBe('1023.0 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('should format terabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
    expect(formatBytes(5 * 1024 * 1024 * 1024 * 1024)).toBe('5.0 TB');
  });

  it('should handle custom decimal places', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
    expect(formatBytes(1536, 3)).toBe('1.500 KB');
  });

  it('should handle negative numbers', () => {
    expect(formatBytes(-100)).toBe('0 B');
  });

  it('should clamp to maximum size unit', () => {
    // Very large number should use PB
    expect(formatBytes(1024 * 1024 * 1024 * 1024 * 1024)).toBe('1.0 PB');
    // Even larger should still use PB (not overflow)
    expect(formatBytes(1024 * 1024 * 1024 * 1024 * 1024 * 10)).toBe('10.0 PB');
  });
});

describe('formatTimeRemaining', () => {
  it('should show complete for zero or negative time', () => {
    expect(formatTimeRemaining(0)).toBe('Complete');
    expect(formatTimeRemaining(-1000)).toBe('Complete');
  });

  it('should format seconds remaining', () => {
    expect(formatTimeRemaining(5000)).toBe('5s remaining');
    expect(formatTimeRemaining(10000)).toBe('10s remaining');
  });

  it('should format minutes remaining', () => {
    expect(formatTimeRemaining(60000)).toBe('1m remaining');
    expect(formatTimeRemaining(125000)).toBe('2m 5s remaining');
  });

  it('should format hours remaining', () => {
    expect(formatTimeRemaining(3600000)).toBe('1h remaining');
    expect(formatTimeRemaining(3665000)).toBe('1h 1m 5s remaining');
  });

  it('should truncate milliseconds', () => {
    expect(formatTimeRemaining(5999)).toBe('5s remaining');
    expect(formatTimeRemaining(5001)).toBe('5s remaining');
  });
});

describe('formatSpeed', () => {
  it('should format zero speed', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
  });

  it('should format bytes per second', () => {
    expect(formatSpeed(500)).toBe('500.0 B/s');
  });

  it('should format kilobytes per second', () => {
    expect(formatSpeed(1024)).toBe('1.0 KB/s');
    expect(formatSpeed(1536)).toBe('1.5 KB/s');
  });

  it('should format megabytes per second', () => {
    expect(formatSpeed(1024 * 1024)).toBe('1.0 MB/s');
    expect(formatSpeed(2.5 * 1024 * 1024)).toBe('2.5 MB/s');
  });

  it('should format gigabytes per second', () => {
    expect(formatSpeed(1024 * 1024 * 1024)).toBe('1.0 GB/s');
  });

  it('should handle negative speeds', () => {
    expect(formatSpeed(-100)).toBe('0 B/s');
  });
});
