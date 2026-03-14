/**
 * Shamir Configuration Panel
 * Sliders for configuring Shamir's Secret Sharing parameters
 */
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Key } from "lucide-react";

interface ShamirConfigProps {
    totalShares: number;
    threshold: number;
    onTotalSharesChange: (value: number) => void;
    onThresholdChange: (value: number) => void;
}

export function ShamirConfig({
    totalShares,
    threshold,
    onTotalSharesChange,
    onThresholdChange,
}: ShamirConfigProps) {
    return (
        <div className="space-y-4 p-4 rounded-lg bg-amber-500/5 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-600">
                <Key className="h-4 w-4" />
                <span className="text-sm font-medium">Shamir Configuration</span>
            </div>

            {/* Total shares slider */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">Total Shares</Label>
                    <span className="text-sm font-medium">{totalShares}</span>
                </div>
                <Slider
                    value={[totalShares]}
                    onValueChange={([v]) => {
                        if (v !== undefined) {
                            onTotalSharesChange(v);
                            // Ensure threshold doesn't exceed total
                            if (threshold > v) {
                                onThresholdChange(v);
                            }
                        }
                    }}
                    min={2}
                    max={10}
                    step={1}
                />
            </div>

            {/* Threshold slider */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">Threshold (minimum needed)</Label>
                    <span className="text-sm font-medium">{threshold}</span>
                </div>
                <Slider
                    value={[threshold]}
                    onValueChange={([v]) => v !== undefined && onThresholdChange(v)}
                    min={2}
                    max={totalShares}
                    step={1}
                />
            </div>

            <p className="text-xs text-amber-600/80">
                Key will be split into <strong>{totalShares}</strong> shares.
                Recipient needs at least <strong>{threshold}</strong> to decrypt.
            </p>
        </div>
    );
}
