/**
 * Shamir Share Input Component
 * 
 * Allows users to input multiple Shamir shares to reconstruct a secret.
 * Shows progress toward threshold and validates share compatibility.
 */
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Key,
    Plus,
    Trash2,
    Check,
    AlertCircle,
    Copy,
    Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    decodeShareFromString,
    validateShares,
    combineKeyShares,
    type EncodedShare
} from "@/lib/shamirSecretSharing";
import { toast } from "sonner";

interface ShamirShareInputProps {
    onSharesComplete: (key: Uint8Array) => void;
    className?: string;
}

export function ShamirShareInput({ onSharesComplete, className }: ShamirShareInputProps) {
    const [shares, setShares] = useState<EncodedShare[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Calculate progress
    const threshold = shares[0]?.threshold ?? 0;
    const totalShares = shares[0]?.totalShares ?? 0;
    const progress = threshold > 0 ? Math.min(100, (shares.length / threshold) * 100) : 0;
    const isComplete = shares.length >= threshold && threshold > 0;

    // Validate shares when they change
    useEffect(() => {
        if (shares.length > 0) {
            const validation = validateShares(shares);
            if (!validation.valid) {
                setError(validation.error ?? "Invalid shares");
            } else {
                setError(null);
            }
        } else {
            setError(null);
        }
    }, [shares]);

    // Try to combine shares when complete
    useEffect(() => {
        if (isComplete && !error) {
            try {
                const key = combineKeyShares(shares);
                onSharesComplete(key);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to combine shares");
            }
        }
    }, [isComplete, error, shares, onSharesComplete]);

    const addShare = useCallback(() => {
        if (!inputValue.trim()) {
            setError("Please enter a share");
            return;
        }

        try {
            const share = decodeShareFromString(inputValue.trim());

            // Check for duplicate
            if (shares.some(s => s.index === share.index)) {
                setError(`Share #${share.index} already added`);
                return;
            }

            // Check compatibility with existing shares
            if (shares.length > 0) {
                const first = shares[0];
                if (first && (share.threshold !== first.threshold || share.totalShares !== first.totalShares)) {
                    setError("This share is from a different set");
                    return;
                }
            }

            setShares(prev => [...prev, share]);
            setInputValue("");
            setError(null);
            toast.success(`Share #${share.index} added`);
        } catch (err) {
            setError("Invalid share format");
        }
    }, [inputValue, shares]);

    const removeShare = useCallback((index: number) => {
        setShares(prev => prev.filter(s => s.index !== index));
    }, []);

    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            setInputValue(text.trim());
        } catch {
            toast.error("Failed to paste from clipboard");
        }
    }, []);

    return (
        <Card className={cn("bg-card/50 backdrop-blur-sm", className)}>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                        <Key className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Shamir's Secret Sharing</CardTitle>
                        <CardDescription>
                            Enter the required shares to unlock the file
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Progress */}
                {threshold > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                                Shares collected
                            </span>
                            <span className="font-medium">
                                {shares.length} / {threshold} required
                            </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                            Original was split into {totalShares} shares
                        </p>
                    </div>
                )}

                {/* Input */}
                <div className="space-y-2">
                    <Label htmlFor="share-input">Add a share</Label>
                    <div className="flex gap-2">
                        <Input
                            id="share-input"
                            placeholder="shamir:v1:1/3/5:..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addShare()}
                            className="flex-1 font-mono text-xs"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handlePaste}
                            title="Paste from clipboard"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                        <Button onClick={addShare} disabled={!inputValue.trim()}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                        </Button>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-2 text-sm text-red-500">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {/* Added shares */}
                {shares.length > 0 && (
                    <div className="space-y-2">
                        <Label>Added shares</Label>
                        <div className="flex flex-wrap gap-2">
                            {shares.map(share => (
                                <Badge
                                    key={share.index}
                                    variant="secondary"
                                    className="flex items-center gap-1 px-3 py-1"
                                >
                                    <Shield className="h-3 w-3" />
                                    Share #{share.index}
                                    <button
                                        onClick={() => removeShare(share.index)}
                                        className="ml-1 hover:text-red-500"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Complete state */}
                {isComplete && !error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600">
                        <Check className="h-5 w-5" />
                        <span className="text-sm font-medium">
                            Secret successfully reconstructed!
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
