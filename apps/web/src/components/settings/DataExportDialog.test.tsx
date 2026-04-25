/**
 * DataExportDialog Component Tests
 *
 * Tests stage rendering, button wiring (Start / Cancel / Try again / Close),
 * pre-delete callback, and the close-blocking behaviour while exporting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DataExportState } from '@/hooks/useDataExport';

// ----- Mocks -----

const mockStartExport = vi.fn();
const mockAbort = vi.fn();
let mockState: DataExportState = {
    phase: 'idle',
    totalFiles: 0,
    totalBytes: 0n,
    completedFiles: 0,
    failedFileNames: [],
    progress: 0,
    error: null,
};

vi.mock('@/hooks/useDataExport', () => ({
    useDataExport: () => ({
        state: mockState,
        startExport: mockStartExport,
        abort: mockAbort,
    }),
}));

const mockListForExportQuery = vi.fn();
vi.mock('@/lib/trpc', () => ({
    trpc: {
        files: {
            listForExport: {
                useQuery: (...args: unknown[]) => mockListForExportQuery(...args),
            },
        },
    },
}));

vi.mock('@/utils/formatters', () => ({
    formatBytes: (n: number) => `${n}B`,
}));

vi.mock('@stenvault/shared/utils', () => ({
    cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

// Stub UI primitives so the rendered tree is easy to assert on
vi.mock('@stenvault/shared/ui/dialog', () => ({
    Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (v: boolean) => void }) =>
        open ? (
            <div data-testid="dialog">
                <button data-testid="dialog-close-trigger" onClick={() => onOpenChange(false)} />
                {children}
            </div>
        ) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('@stenvault/shared/ui/button', () => ({
    Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
        <button onClick={onClick} disabled={disabled}>{children}</button>
    ),
}));

vi.mock("@stenvault/shared/ui/progress", () => ({
    Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
}));

vi.mock('lucide-react', () => ({
    Download: () => <span data-testid="icon-download" />,
    Lock: () => <span data-testid="icon-lock" />,
    Loader2: () => <span data-testid="icon-loader" />,
    AlertTriangle: () => <span data-testid="icon-alert" />,
    CheckCircle2: () => <span data-testid="icon-check" />,
}));

// Imports must come AFTER mocks
import { DataExportDialog } from './DataExportDialog';

const setStateForTest = (overrides: Partial<DataExportState>) => {
    mockState = {
        phase: 'idle',
        totalFiles: 0,
        totalBytes: 0n,
        completedFiles: 0,
        failedFileNames: [],
        progress: 0,
        error: null,
        ...overrides,
    };
};

describe('DataExportDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setStateForTest({ phase: 'idle' });
        mockListForExportQuery.mockReturnValue({
            data: { totalFiles: 12, totalSize: '4096' },
            isLoading: false,
        });
    });

    it('renders the idle preview with totals from listForExport', () => {
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('4096B')).toBeInTheDocument();
        expect(screen.getByText(/Start Export/i)).toBeInTheDocument();
    });

    it('shows a counting spinner while preview is loading', () => {
        mockListForExportQuery.mockReturnValueOnce({ data: undefined, isLoading: true });
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByText(/Counting your files/i)).toBeInTheDocument();
    });

    it('disables Start Export when the vault is empty', () => {
        mockListForExportQuery.mockReturnValueOnce({
            data: { totalFiles: 0, totalSize: '0' },
            isLoading: false,
        });
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        const startBtn = screen.getByText(/Start Export/i).closest('button')!;
        expect(startBtn).toBeDisabled();
    });

    it('calls startExport when the Start button is clicked', async () => {
        const user = userEvent.setup();
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        await user.click(screen.getByText(/Start Export/i).closest('button')!);
        expect(mockStartExport).toHaveBeenCalled();
    });

    it('renders progress and a Cancel Export button while exporting', () => {
        setStateForTest({
            phase: 'exporting',
            totalFiles: 100,
            completedFiles: 47,
            progress: 47,
            totalBytes: 1024n,
        });
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        const progress = screen.getByTestId('progress');
        expect(progress.getAttribute('data-value')).toBe('47');
        expect(screen.getByText(/Cancel Export/i)).toBeInTheDocument();
    });

    it('calls abort when Cancel Export is clicked during export', async () => {
        setStateForTest({ phase: 'exporting', progress: 50 });
        const user = userEvent.setup();
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        await user.click(screen.getByText(/Cancel Export/i).closest('button')!);
        expect(mockAbort).toHaveBeenCalled();
    });

    it('blocks dialog close while exporting', async () => {
        setStateForTest({ phase: 'exporting', progress: 50 });
        const onOpenChange = vi.fn();
        const user = userEvent.setup();
        render(<DataExportDialog open={true} onOpenChange={onOpenChange} />);
        await user.click(screen.getByTestId('dialog-close-trigger'));
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('shows the complete summary and lists skipped files', () => {
        setStateForTest({
            phase: 'complete',
            totalFiles: 5,
            completedFiles: 5,
            failedFileNames: ['skipped-1.bin', 'skipped-2.bin'],
            progress: 100,
        });
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByText(/Export complete/i)).toBeInTheDocument();
        expect(screen.getByText(/2 skipped/i)).toBeInTheDocument();
        expect(screen.getByText('skipped-1.bin')).toBeInTheDocument();
        expect(screen.getByText('skipped-2.bin')).toBeInTheDocument();
        expect(screen.getByText('Close')).toBeInTheDocument();
    });

    it('fires onExportComplete exactly once when phase reaches complete', async () => {
        setStateForTest({ phase: 'complete', totalFiles: 5, completedFiles: 5, progress: 100 });
        const onExportComplete = vi.fn();
        const { rerender } = render(
            <DataExportDialog open={true} onOpenChange={vi.fn()} preDelete onExportComplete={onExportComplete} />,
        );
        await waitFor(() => expect(onExportComplete).toHaveBeenCalledTimes(1));
        // Re-render with same state — must not fire again
        rerender(<DataExportDialog open={true} onOpenChange={vi.fn()} preDelete onExportComplete={onExportComplete} />);
        expect(onExportComplete).toHaveBeenCalledTimes(1);
    });

    it('shows the error message and a Try again button on error', async () => {
        setStateForTest({ phase: 'error', error: 'boom' });
        const user = userEvent.setup();
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByText('boom')).toBeInTheDocument();
        await user.click(screen.getByText(/Try again/i).closest('button')!);
        expect(mockStartExport).toHaveBeenCalled();
    });

    it('uses pre-delete copy when preDelete=true', () => {
        render(<DataExportDialog open={true} onOpenChange={vi.fn()} preDelete />);
        expect(
            screen.getByText(/Download a copy of your data before deleting your account/i),
        ).toBeInTheDocument();
    });

    it('does not render anything when closed', () => {
        const { container } = render(<DataExportDialog open={false} onOpenChange={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });
});
