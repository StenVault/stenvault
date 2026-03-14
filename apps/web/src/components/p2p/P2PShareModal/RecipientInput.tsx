/**
 * Recipient Input
 * Optional email input for restricting who can receive the file
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecipientInputProps {
    value: string;
    onChange: (value: string) => void;
}

export function RecipientInput({ value, onChange }: RecipientInputProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Email (optional)</Label>
            <Input
                id="recipient"
                type="email"
                placeholder="friend@example.com"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
                If provided, only this user can receive the file
            </p>
        </div>
    );
}
