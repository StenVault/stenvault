import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthRecoveryCodesGrid } from './AuthRecoveryCodesGrid';

vi.mock('@stenvault/shared/lib/toast', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const sampleCodes = [
    'ABCD2345FGHJ',
    'KLMNPQRSTUVW',
    'XYZ23456789A',
];

describe('AuthRecoveryCodesGrid', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders each code with its number prefix', () => {
        render(<AuthRecoveryCodesGrid codes={sampleCodes} />);
        const codes = screen.getAllByTestId('recovery-code');
        expect(codes).toHaveLength(sampleCodes.length);
        expect(codes[0]?.textContent).toBe('ABCD2345FGHJ');
        expect(screen.getByText('1.')).toBeInTheDocument();
        expect(screen.getByText('2.')).toBeInTheDocument();
        expect(screen.getByText('3.')).toBeInTheDocument();
    });

    it('copies newline-joined codes and fires onCopied', async () => {
        const user = userEvent.setup();
        const onCopied = vi.fn();
        const writeSpy = vi.spyOn(navigator.clipboard, 'writeText');
        render(<AuthRecoveryCodesGrid codes={sampleCodes} onCopied={onCopied} />);
        await user.click(screen.getByRole('button', { name: /copy all/i }));
        expect(writeSpy).toHaveBeenCalledWith(sampleCodes.join('\n'));
        expect(onCopied).toHaveBeenCalledTimes(1);
        writeSpy.mockRestore();
    });

    it('shows "Copied!" label after copying', async () => {
        const user = userEvent.setup();
        render(<AuthRecoveryCodesGrid codes={sampleCodes} />);
        await user.click(screen.getByRole('button', { name: /copy all/i }));
        expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
    });

    it('triggers a Blob download with the supplied filename', async () => {
        const user = userEvent.setup();
        const createObjectURL = vi.fn(() => 'blob:test');
        const revokeObjectURL = vi.fn();
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
        URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { });
        const onDownloaded = vi.fn();

        try {
            render(
                <AuthRecoveryCodesGrid
                    codes={sampleCodes}
                    filename="custom-codes.txt"
                    onDownloaded={onDownloaded}
                />
            );
            await user.click(screen.getByRole('button', { name: /download/i }));

            expect(createObjectURL).toHaveBeenCalledTimes(1);
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
            expect(onDownloaded).toHaveBeenCalledTimes(1);
        } finally {
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
            clickSpy.mockRestore();
        }
    });
});
