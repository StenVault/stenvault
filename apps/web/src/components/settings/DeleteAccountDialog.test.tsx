/**
 * Covers the "Download-before-delete" flow:
 *   - fileCount > 0 → download nudge, password inputs hidden
 *   - Continue Without Downloading → password inputs revealed
 *   - Download My Data → DataExportDialog opens with preDelete
 *   - onExportComplete → password inputs revealed without manual skip
 *   - fileCount === 0 → nudge bypassed
 *   - hasActiveOperations → delete button disabled
 *   - hasBlockers → only blocker alert, no nudge, no inputs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ----- Mocks -----

type PreDeleteCheck = {
    canDelete: boolean;
    blockers: string[];
    fileCount: number;
    folderCount: number;
    subscriptionPlan: 'free' | 'pro' | 'business';
};

const mockPreDeleteQuery = vi.fn();
const mockDeleteStart = vi.fn();
const mockDeleteFinish = vi.fn();

vi.mock('@/lib/trpc', () => ({
    trpc: {
        profile: {
            preDeleteCheck: {
                useQuery: (...args: unknown[]) => mockPreDeleteQuery(...args),
            },
            deleteAccount: {
                useMutation: () => ({ mutateAsync: mockDeleteStart }),
            },
            deleteAccountFinish: {
                useMutation: () => ({ mutateAsync: mockDeleteFinish }),
            },
        },
    },
}));

let mockHasActiveOps = false;
vi.mock('@/stores/operationStore', () => ({
    useHasActiveOperations: () => mockHasActiveOps,
}));

const mockStartLogin = vi.fn();
const mockFinishLogin = vi.fn();
vi.mock('@/lib/opaqueClient', () => ({
    startLogin: (...args: unknown[]) => mockStartLogin(...args),
    finishLogin: (...args: unknown[]) => mockFinishLogin(...args),
}));

vi.mock('@/lib/auth', () => ({
    clearAllTokens: vi.fn(),
}));

vi.mock('@/hooks/useMasterKey', () => ({
    clearMasterKeyCache: vi.fn(),
    clearDeviceWrappedMK: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Stub DataExportDialog so we can assert it opens with preDelete=true
const dataExportDialogRenders: Array<{ open: boolean; preDelete?: boolean }> = [];
const mockExportOnOpenChange = vi.fn();
const mockExportOnComplete = vi.fn();
vi.mock('./DataExportDialog', () => ({
    DataExportDialog: (props: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        preDelete?: boolean;
        onExportComplete?: () => void;
    }) => {
        dataExportDialogRenders.push({ open: props.open, preDelete: props.preDelete });
        // Expose hooks so the test can fire them
        if (props.open) {
            mockExportOnOpenChange.mockImplementation(props.onOpenChange);
            mockExportOnComplete.mockImplementation(() => props.onExportComplete?.());
        }
        return props.open ? (
            <div data-testid="data-export-dialog">
                <span data-testid="data-export-predelete">{String(props.preDelete ?? false)}</span>
                <button
                    data-testid="fire-export-complete"
                    onClick={() => props.onExportComplete?.()}
                >
                    fire-complete
                </button>
            </div>
        ) : null;
    },
}));

// Stub shadcn primitives — keep markup minimal and assertion-friendly
vi.mock('@stenvault/shared/ui/dialog', () => ({
    Dialog: ({
        children,
        open,
        onOpenChange,
    }: {
        children: React.ReactNode;
        open: boolean;
        onOpenChange: (v: boolean) => void;
    }) =>
        open ? (
            <div data-testid="delete-dialog">
                <button data-testid="dialog-close-trigger" onClick={() => onOpenChange(false)} />
                {children}
            </div>
        ) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@stenvault/shared/ui/button', () => ({
    Button: ({
        children,
        onClick,
        disabled,
    }: {
        children: React.ReactNode;
        onClick?: () => void;
        disabled?: boolean;
    }) => (
        <button onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

vi.mock("@stenvault/shared/ui/input", () => ({
    Input: ({
        id,
        value,
        onChange,
        placeholder,
        disabled,
        type,
    }: {
        id?: string;
        value: string;
        onChange: (e: { target: { value: string } }) => void;
        placeholder?: string;
        disabled?: boolean;
        type?: string;
    }) => (
        <input
            id={id}
            data-testid={id}
            value={value}
            onChange={(e) => onChange({ target: { value: e.target.value } })}
            placeholder={placeholder}
            disabled={disabled}
            type={type}
        />
    ),
}));

vi.mock('@stenvault/shared/ui/label', () => ({
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
        <label htmlFor={htmlFor}>{children}</label>
    ),
}));

vi.mock('@/components/ui/alert', () => ({
    Alert: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="alert">{children}</div>
    ),
    AlertTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
    AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('lucide-react', () => ({
    Download: () => <span data-testid="icon-download" />,
    Loader2: () => <span data-testid="icon-loader" />,
    AlertTriangle: () => <span data-testid="icon-alert" />,
    ShieldAlert: () => <span data-testid="icon-shield" />,
    CreditCard: () => <span data-testid="icon-card" />,
}));

// Imports come after mocks
import { DeleteAccountDialog } from './DeleteAccountDialog';

const defaultCheck: PreDeleteCheck = {
    canDelete: true,
    blockers: [],
    fileCount: 5,
    folderCount: 2,
    subscriptionPlan: 'free',
};

const stubQuery = (overrides: Partial<PreDeleteCheck> & { isLoading?: boolean } = {}) => {
    const { isLoading = false, ...checkOverrides } = overrides;
    mockPreDeleteQuery.mockReturnValue({
        data: isLoading ? undefined : { ...defaultCheck, ...checkOverrides },
        isLoading,
    });
};

describe('DeleteAccountDialog — Download-before-delete flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHasActiveOps = false;
        dataExportDialogRenders.length = 0;
        stubQuery();
    });

    it('shows the download nudge when the user has files', () => {
        stubQuery({ fileCount: 5 });
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        expect(screen.getByText(/Download your data first/i)).toBeInTheDocument();
        expect(screen.getByText(/You have 5 files in your vault/i)).toBeInTheDocument();
        expect(screen.queryByTestId('delete-password')).not.toBeInTheDocument();
        expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument();
    });

    it('hides the nudge when the vault is empty and shows password inputs immediately', () => {
        stubQuery({ fileCount: 0, folderCount: 0 });
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        expect(screen.queryByText(/Download your data first/i)).not.toBeInTheDocument();
        expect(screen.getByTestId('delete-password')).toBeInTheDocument();
        expect(screen.getByTestId('delete-confirm')).toBeInTheDocument();
    });

    it('reveals password inputs after clicking Continue Without Downloading', async () => {
        stubQuery({ fileCount: 5 });
        const user = userEvent.setup();
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        await user.click(screen.getByText(/Continue Without Downloading/i));

        expect(screen.queryByText(/Download your data first/i)).not.toBeInTheDocument();
        expect(screen.getByTestId('delete-password')).toBeInTheDocument();
        expect(screen.getByTestId('delete-confirm')).toBeInTheDocument();
    });

    it('opens DataExportDialog with preDelete=true when Download My Data is clicked', async () => {
        stubQuery({ fileCount: 5 });
        const user = userEvent.setup();
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        await user.click(screen.getByText(/Download My Data/i));

        expect(screen.getByTestId('data-export-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('data-export-predelete').textContent).toBe('true');
    });

    it('reveals password inputs after onExportComplete fires', async () => {
        stubQuery({ fileCount: 5 });
        const user = userEvent.setup();
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        await user.click(screen.getByText(/Download My Data/i));
        await user.click(screen.getByTestId('fire-export-complete'));

        expect(screen.queryByText(/Download your data first/i)).not.toBeInTheDocument();
        expect(screen.getByTestId('delete-password')).toBeInTheDocument();
    });

    it('disables the Delete button when an export is active', async () => {
        stubQuery({ fileCount: 0 });
        mockHasActiveOps = true;
        const user = userEvent.setup();
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        await user.type(screen.getByTestId('delete-password'), 'mypassword');
        await user.type(screen.getByTestId('delete-confirm'), 'DELETE');

        const deleteBtn = screen.getByText('Delete My Account').closest('button')!;
        expect(deleteBtn).toBeDisabled();
    });

    it('keeps the Delete button disabled while the user still needs to respond to the download nudge', async () => {
        stubQuery({ fileCount: 3 });
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        const deleteBtn = screen.getByText('Delete My Account').closest('button')!;
        expect(deleteBtn).toBeDisabled();
    });

    it('shows only the blockers alert when the account cannot be deleted (org owner)', () => {
        stubQuery({
            canDelete: false,
            blockers: ['Transfer ownership of Acme Inc. before deleting your account'],
            fileCount: 5,
        });
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        expect(screen.getByText(/Cannot delete account/i)).toBeInTheDocument();
        expect(screen.getByText(/Transfer ownership/i)).toBeInTheDocument();
        expect(screen.queryByText(/Download your data first/i)).not.toBeInTheDocument();
        expect(screen.queryByTestId('delete-password')).not.toBeInTheDocument();
    });

    it('shows the paid subscription warning alongside the download nudge for Pro users', () => {
        stubQuery({ fileCount: 5, subscriptionPlan: 'pro' });
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        expect(screen.getByText(/Active subscription/i)).toBeInTheDocument();
        expect(screen.getByText(/Pro subscription will be/i)).toBeInTheDocument();
        expect(screen.getByText(/Download your data first/i)).toBeInTheDocument();
    });

    it('singularizes the file count copy for a single file', () => {
        stubQuery({ fileCount: 1 });
        render(<DeleteAccountDialog open={true} onOpenChange={vi.fn()} />);

        expect(screen.getByText(/You have 1 file in your vault/i)).toBeInTheDocument();
    });
});
