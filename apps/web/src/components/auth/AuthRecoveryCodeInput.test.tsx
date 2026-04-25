import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AuthRecoveryCodeInput } from './AuthRecoveryCodeInput';

function Harness({
    length = 12,
    initial = '',
    helperText,
    error,
}: {
    length?: number;
    initial?: string;
    helperText?: string;
    error?: string;
}) {
    const [value, setValue] = useState(initial);
    return (
        <AuthRecoveryCodeInput
            length={length}
            value={value}
            onChange={setValue}
            helperText={helperText}
            error={error}
        />
    );
}

describe('AuthRecoveryCodeInput', () => {
    it('uppercases and filters non-alphanumeric characters', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        await user.type(input, 'abc-123!xyz');
        expect(input.value).toBe('ABC123XYZ');
    });

    it('enforces the configured length', async () => {
        const user = userEvent.setup();
        render(<Harness length={12} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        await user.type(input, 'ABCDEFGHJKLMNPQR');
        expect(input.value).toHaveLength(12);
    });

    it('renders the helper text above the input', () => {
        render(<Harness helperText="Enter one of your 12-character recovery codes" />);
        expect(
            screen.getByText('Enter one of your 12-character recovery codes')
        ).toBeInTheDocument();
    });

    it('marks input invalid when an error is provided', () => {
        render(<Harness error="Invalid code" />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(screen.getByText('Invalid code')).toBeInTheDocument();
    });

    it('exposes label and autocapitalize attributes for mobile keyboards', () => {
        render(<Harness />);
        const input = screen.getByLabelText(/recovery code/i) as HTMLInputElement;
        expect(input.getAttribute('autocapitalize')).toBe('characters');
        expect(input.getAttribute('autocomplete')).toBe('off');
    });
});
