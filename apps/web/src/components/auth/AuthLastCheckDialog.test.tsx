import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthLastCheckDialog } from './AuthLastCheckDialog';

describe('AuthLastCheckDialog', () => {
    it('renders nothing when closed', () => {
        render(
            <AuthLastCheckDialog
                open={false}
                onReview={vi.fn()}
                onConfirm={vi.fn()}
            />
        );
        expect(screen.queryByText(/last check/i)).not.toBeInTheDocument();
    });

    it('renders title, description and both CTAs when open', () => {
        render(
            <AuthLastCheckDialog
                open={true}
                onReview={vi.fn()}
                onConfirm={vi.fn()}
            />
        );
        expect(
            screen.getByRole('alertdialog', { name: /last check/i })
        ).toBeInTheDocument();
        expect(
            screen.getByText(/we can't reset this password/i)
        ).toBeInTheDocument();
        expect(
            screen.getByText(/recovery codes \(next step\) are the only way back/i)
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /let me review/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /seal my files/i })
        ).toBeInTheDocument();
    });

    it('fires onReview when Let me review is clicked', async () => {
        const user = userEvent.setup();
        const onReview = vi.fn();
        const onConfirm = vi.fn();
        render(
            <AuthLastCheckDialog open={true} onReview={onReview} onConfirm={onConfirm} />
        );

        await user.click(screen.getByRole('button', { name: /let me review/i }));

        expect(onReview).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('fires onConfirm when Seal my files is clicked', async () => {
        const user = userEvent.setup();
        const onReview = vi.fn();
        const onConfirm = vi.fn();
        render(
            <AuthLastCheckDialog open={true} onReview={onReview} onConfirm={onConfirm} />
        );

        await user.click(screen.getByRole('button', { name: /seal my files/i }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onReview).not.toHaveBeenCalled();
    });
});
