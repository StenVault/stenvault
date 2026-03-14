/**
 * Utility Functions Tests
 */

import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (className utility)', () => {
  it('should merge class names', () => {
    const result = cn('px-2', 'py-1');
    expect(result).toContain('px-2');
    expect(result).toContain('py-1');
  });

  it('should handle conditional classes', () => {
    const result = cn('base', true && 'active', false && 'inactive');
    expect(result).toContain('base');
    expect(result).toContain('active');
    expect(result).not.toContain('inactive');
  });

  it('should merge conflicting Tailwind classes (last wins)', () => {
    // twMerge should handle Tailwind conflicts
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });

  it('should handle arrays of classes', () => {
    const result = cn(['px-2', 'py-1']);
    expect(result).toContain('px-2');
    expect(result).toContain('py-1');
  });

  it('should handle objects with boolean values', () => {
    const result = cn({
      'px-2': true,
      'py-1': true,
      'hidden': false,
    });
    expect(result).toContain('px-2');
    expect(result).toContain('py-1');
    expect(result).not.toContain('hidden');
  });

  it('should handle undefined and null', () => {
    const result = cn('px-2', undefined, null, 'py-1');
    expect(result).toContain('px-2');
    expect(result).toContain('py-1');
  });

  it('should handle empty input', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('should handle complex Tailwind conflicts', () => {
    // Should keep only the last conflicting class
    const result = cn('text-sm', 'text-lg', 'text-xl');
    expect(result).toBe('text-xl');
  });
});
