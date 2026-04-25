import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AuthOTPInput } from './AuthOTPInput';

function Harness({
    initial = '',
    length = 6,
    variant = 'numeric' as const,
    onComplete,
    error,
}: {
    initial?: string;
    length?: number;
    variant?: 'numeric' | 'alphanumeric-with-backup';
    onComplete?: (value: string) => void;
    error?: string;
}) {
    const [value, setValue] = useState(initial);
    return (
        <AuthOTPInput
            length={length}
            value={value}
            onChange={setValue}
            variant={variant}
            onComplete={onComplete}
            error={error}
        />
    );
}

describe('AuthOTPInput', () => {
    it('applies numeric defaults and placeholder 000000 for length 6', () => {
        render(<Harness />);
        const input = screen.getByPlaceholderText('000000') as HTMLInputElement;
        expect(input.inputMode).toBe('numeric');
        expect(input.pattern).toBe('[0-9]*');
        expect(input.getAttribute('autocomplete')).toBe('one-time-code');
        expect(input.maxLength).toBe(6);
    });

    it('strips letters in numeric variant', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        await user.type(input, '12ab34');
        expect(input.value).toBe('1234');
    });

    it('allows backup-code alphanumerics (with dash) in alphanumeric variant', async () => {
        const user = userEvent.setup();
        render(<Harness variant="alphanumeric-with-backup" length={9} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        await user.type(input, 'AB12-CD!@#');
        expect(input.value).toBe('AB12-CD');
    });

    it('omits the numeric placeholder when variant is alphanumeric-with-backup', () => {
        render(<Harness variant="alphanumeric-with-backup" length={9} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.placeholder).toBe('');
    });

    it('fires onComplete exactly once when value length reaches the configured length', async () => {
        const user = userEvent.setup();
        const onComplete = vi.fn();
        render(<Harness onComplete={onComplete} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        await user.type(input, '123456');
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledWith('123456');
    });

    it('renders error text and marks input invalid', () => {
        render(<Harness error="Invalid code" />);
        expect(screen.getByText('Invalid code')).toBeInTheDocument();
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('respects length less than 6 for placeholder', () => {
        render(<Harness length={4} />);
        expect(screen.getByPlaceholderText('0000')).toBeInTheDocument();
    });
});
