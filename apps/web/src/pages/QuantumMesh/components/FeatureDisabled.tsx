/**
 * Feature Disabled State Component
 * Displayed when P2P sharing is disabled
 */
import { Button } from "@/components/ui/button";
import {
    Network,
    WifiOff,
} from "lucide-react";

export function FeatureDisabled() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <div className="p-6 rounded-full bg-muted/50 mb-6">
                <Network className="h-16 w-16 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Quantum Mesh Network</h1>
            <p className="text-muted-foreground max-w-md mb-6">
                The P2P sharing feature is currently disabled. Contact your administrator to enable it.
            </p>
            <Button variant="outline" disabled>
                <WifiOff className="h-4 w-4 mr-2" />
                Feature Disabled
            </Button>
        </div>
    );
}
