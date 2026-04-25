/**
 * DataExportSection — surface tests.
 *
 * The actual export pipeline (chunked download, decrypt, ZIP stream) is
 * exercised by DataExportDialog.test.tsx. This file only verifies the
 * card renders and toggles the dialog open. Anything heavier belongs in
 * the dialog's own test file.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('lucide-react', () => ({
    Download: () => <div data-testid="icon-download" />,
}));

vi.mock('@stenvault/shared/ui/aurora-card', () => ({
    AuroraCard: ({ children }: any) => <div data-testid="card">{children}</div>,
}));

vi.mock('@stenvault/shared/ui/button', () => ({
    Button: ({ children, onClick }: any) => (
        <button onClick={onClick}>{children}</button>
    ),
}));

vi.mock('./DataExportDialog', () => ({
    DataExportDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid="export-dialog" /> : null,
}));

import { DataExportSection } from './DataExportSection';

describe('DataExportSection', () => {
    it('renders the Download your data card', () => {
        render(<DataExportSection />);
        expect(screen.getByText('Download your data')).toBeInTheDocument();
        expect(
            screen.getByText('Export every file in your vault as a ZIP archive'),
        ).toBeInTheDocument();
    });

    it('renders the Export Data trigger', () => {
        render(<DataExportSection />);
        expect(screen.getByText('Export Data')).toBeInTheDocument();
        expect(screen.getByTestId('icon-download')).toBeInTheDocument();
    });

    it('keeps the dialog closed by default', () => {
        render(<DataExportSection />);
        expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
    });

    it('opens the dialog when Export Data is clicked', async () => {
        const user = userEvent.setup();
        render(<DataExportSection />);
        await user.click(screen.getByText('Export Data'));
        expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
    });
});
