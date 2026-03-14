/**
 * FileList Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { getFileIcon, renderFileIcon, formatFileSize, containerVariants, itemVariants } from './utils';

describe('getFileIcon', () => {
  it('should return image icon for image type', () => {
    const result = getFileIcon('image');
    expect(result.className).toContain('text-green-500');
  });

  it('should return video icon for video type', () => {
    const result = getFileIcon('video');
    expect(result.className).toContain('text-purple-500');
  });

  it('should return audio icon for audio type', () => {
    const result = getFileIcon('audio');
    expect(result.className).toContain('text-orange-500');
  });

  it('should return document icon for document type', () => {
    const result = getFileIcon('document');
    expect(result.className).toContain('text-blue-500');
  });

  it('should return generic icon for other type', () => {
    const result = getFileIcon('other');
    expect(result.className).toContain('text-gray-500');
  });

  it('should return generic icon for folder type', () => {
    const result = getFileIcon('folder');
    expect(result.className).toContain('text-gray-500');
  });

  it('should include base class', () => {
    const result = getFileIcon('image');
    expect(result.className).toContain('w-5');
    expect(result.className).toContain('h-5');
  });

  it('should include custom className', () => {
    const result = getFileIcon('image', 'custom-class');
    expect(result.className).toContain('custom-class');
  });
});

describe('renderFileIcon', () => {
  it('should render icon as JSX element', () => {
    const { container } = render(<>{renderFileIcon('image')}</>);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should apply correct color class for image', () => {
    const { container } = render(<>{renderFileIcon('image')}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-green-500');
  });

  it('should apply correct color class for video', () => {
    const { container } = render(<>{renderFileIcon('video')}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-purple-500');
  });

  it('should apply correct color class for audio', () => {
    const { container } = render(<>{renderFileIcon('audio')}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-orange-500');
  });

  it('should apply correct color class for document', () => {
    const { container } = render(<>{renderFileIcon('document')}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-blue-500');
  });

  it('should apply custom className', () => {
    const { container } = render(<>{renderFileIcon('image', 'extra-class')}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('extra-class');
  });
});

describe('formatFileSize', () => {
  it('should format zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('should format bytes with decimals', () => {
    // Web version uses 1 decimal by default
    expect(formatFileSize(500)).toBe('500.0 B');
  });

  it('should format kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('should format gigabytes correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

describe('containerVariants', () => {
  it('should have hidden state', () => {
    expect(containerVariants.hidden).toBeDefined();
    expect(containerVariants.hidden.opacity).toBe(0);
  });

  it('should have show state', () => {
    expect(containerVariants.show).toBeDefined();
    expect(containerVariants.show.opacity).toBe(1);
  });

  it('should have stagger transition', () => {
    expect(containerVariants.show.transition).toBeDefined();
    expect(containerVariants.show.transition.staggerChildren).toBeDefined();
  });
});

describe('itemVariants', () => {
  it('should have hidden state', () => {
    expect(itemVariants.hidden).toBeDefined();
    expect(itemVariants.hidden.opacity).toBe(0);
    expect(itemVariants.hidden.y).toBe(10);
    expect(itemVariants.hidden.scale).toBe(0.95);
  });

  it('should have show state', () => {
    expect(itemVariants.show).toBeDefined();
    expect(itemVariants.show.opacity).toBe(1);
    expect(itemVariants.show.y).toBe(0);
    expect(itemVariants.show.scale).toBe(1);
  });
});
