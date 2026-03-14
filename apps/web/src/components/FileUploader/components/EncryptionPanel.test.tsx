/**
 * EncryptionPanel Component Tests
 *
 * Encryption is always mandatory via Master Key - panel shows status only.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EncryptionPanel } from './EncryptionPanel';

// Mock dependencies
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      brand: { primary: '#6366f1' },
      semantic: { success: '#22c55e', warning: '#f59e0b' },
    },
  }),
}));

describe('EncryptionPanel', () => {
  it('should render automatic encryption active message', () => {
    render(<EncryptionPanel />);

    expect(screen.getByText(/automatic encryption active/i)).toBeInTheDocument();
  });

  it('should show Master Key encryption description', () => {
    render(<EncryptionPanel />);

    expect(screen.getByText(/files are encrypted with your master key before upload/i)).toBeInTheDocument();
  });

  it('should show zero-knowledge info', () => {
    render(<EncryptionPanel />);

    expect(screen.getByText(/zero-knowledge/i)).toBeInTheDocument();
    expect(screen.getByText(/only you can decrypt them with your master password/i)).toBeInTheDocument();
  });

  it('should have green border styling', () => {
    const { container } = render(<EncryptionPanel />);

    const panel = container.firstChild as HTMLElement;
    expect(panel).toHaveClass('border-green-500/50');
  });

  it('should not have any toggle or password input', () => {
    render(<EncryptionPanel />);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/password/i)).not.toBeInTheDocument();
  });
});
