/**
 * Encryption Selector
 * Radio group for selecting encryption method (webrtc/double/shamir)
 */
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Shield, ShieldCheck, Key } from "lucide-react";
import type { EncryptionMethod } from "../types";

interface EncryptionSelectorProps {
    value: EncryptionMethod;
    onChange: (value: EncryptionMethod) => void;
}

export function EncryptionSelector({ value, onChange }: EncryptionSelectorProps) {
    return (
        <div className="space-y-3">
            <Label>Encryption Level</Label>
            <RadioGroup
                value={value}
                onValueChange={(v) => onChange(v as EncryptionMethod)}
                className="grid gap-3"
            >
                {/* Standard WebRTC */}
                <label
                    htmlFor="webrtc"
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                    <RadioGroupItem value="webrtc" id="webrtc" />
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">Standard</p>
                        <p className="text-xs text-muted-foreground">
                            WebRTC DTLS encryption
                        </p>
                    </div>
                </label>

                {/* Double Encryption (Recommended) */}
                <label
                    htmlFor="double"
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${value === "double" ? "border-primary/30 bg-primary/5" : ""
                        }`}
                >
                    <RadioGroupItem value="double" id="double" />
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">Double Encryption</p>
                        <p className="text-xs text-muted-foreground">
                            E2E + Transport layer (recommended)
                        </p>
                    </div>
                    <Badge variant="secondary">Recommended</Badge>
                </label>

                {/* Shamir's Secret Sharing */}
                <label
                    htmlFor="shamir"
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${value === "shamir" ? "border-amber-500/30 bg-amber-500/5" : ""
                        }`}
                >
                    <RadioGroupItem value="shamir" id="shamir" />
                    <Key className="h-5 w-5 text-amber-500" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">Shamir's Secret</p>
                        <p className="text-xs text-muted-foreground">
                            Split key into multiple shares
                        </p>
                    </div>
                    <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                        Advanced
                    </Badge>
                </label>
            </RadioGroup>
        </div>
    );
}
