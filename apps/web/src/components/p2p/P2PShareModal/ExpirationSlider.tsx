/**
 * Expiration Slider
 * Slider for configuring session expiration time
 */
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Clock } from "lucide-react";

interface ExpirationSliderProps {
    value: number; // minutes
    onChange: (value: number) => void;
}

/**
 * Format minutes to human readable string
 */
function formatExpiration(minutes: number): string {
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        return `${hours}h`;
    }
    return `${minutes}m`;
}

export function ExpirationSlider({ value, onChange }: ExpirationSliderProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Link expires in
                </Label>
                <span className="text-sm font-medium">
                    {formatExpiration(value)}
                </span>
            </div>
            <Slider
                value={[value]}
                onValueChange={([v]) => v !== undefined && onChange(v)}
                min={5}
                max={1440} // 24 hours
                step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>5 min</span>
                <span>24 hours</span>
            </div>
        </div>
    );
}
