import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyRound, Lock, Shield } from 'lucide-react';
import { AuthExplainer, type AuthExplainerItem } from './AuthExplainer';

const items: AuthExplainerItem[] = [
    { icon: KeyRound, label: 'Sign-in', sub: "Proves it's you. We verify it." },
    { icon: Lock, label: 'Encryption', sub: 'Seals your files. Only you hold it.' },
    { icon: Shield, label: 'Files', sub: 'Stored as unreadable noise. Never scanned.' },
];

describe('AuthExplainer', () => {
    it('renders every item with label and sub text', () => {
        render(<AuthExplainer items={items} />);
        expect(screen.getByText('Sign-in')).toBeInTheDocument();
        expect(screen.getByText('Encryption')).toBeInTheDocument();
        expect(screen.getByText('Files')).toBeInTheDocument();
        expect(screen.getByText("Proves it's you. We verify it.")).toBeInTheDocument();
        expect(screen.getByText('Seals your files. Only you hold it.')).toBeInTheDocument();
        expect(screen.getByText('Stored as unreadable noise. Never scanned.')).toBeInTheDocument();
    });

    it('exposes the sr-only label when supplied', () => {
        render(<AuthExplainer items={items} srLabel="Two-password model overview" />);
        expect(screen.getByText('Two-password model overview')).toBeInTheDocument();
    });

    it('marks the current cell with aria-current="step" and highlights others at reduced opacity', () => {
        const { container } = render(<AuthExplainer items={items} current={1} />);
        const cells = container.querySelectorAll('[aria-current]');
        expect(cells).toHaveLength(1);
        expect(cells[0]).toHaveAttribute('aria-current', 'step');
        // Non-current cells carry opacity-60 class; current cell does not
        const allCells = container.querySelectorAll(':scope > div > div, :scope > div');
        const firstCell = container.firstElementChild?.children[0] as HTMLElement;
        const secondCell = container.firstElementChild?.children[1] as HTMLElement;
        expect(firstCell.className).toContain('opacity-60');
        expect(secondCell.className).not.toContain('opacity-60');
    });

    it('applies no opacity dimming when current is undefined', () => {
        const { container } = render(<AuthExplainer items={items} />);
        const allCells = Array.from(container.firstElementChild?.children ?? []);
        allCells.forEach((cell) => {
            expect((cell as HTMLElement).className).not.toContain('opacity-60');
        });
    });
});
