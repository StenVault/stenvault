import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// VaultUnlockModal reaches into tRPC + auth internals; stub it to a sentinel
// that proves we forward the isOpen prop when the button is clicked.
vi.mock('@/components/VaultUnlockModal', () => ({
    VaultUnlockModal: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="vault-unlock-modal-open" /> : null,
}));

import { InlineUnlockPrompt } from './InlineUnlockPrompt';

describe('InlineUnlockPrompt', () => {
    it('renders the locked-vault copy and unlock button', () => {
        render(<InlineUnlockPrompt />);
        expect(screen.getByText(/vault is locked/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /unlock vault/i })).toBeInTheDocument();
    });

    it('opens the VaultUnlockModal when the button is clicked', async () => {
        render(<InlineUnlockPrompt />);
        expect(screen.queryByTestId('vault-unlock-modal-open')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /unlock vault/i }));

        expect(screen.getByTestId('vault-unlock-modal-open')).toBeInTheDocument();
    });
});
