/**
 * Security Features Banner Component
 * Displays P2P security features
 */
import { Card, CardContent } from "@/components/ui/card";
import {
    Shield,
    Zap,
    Users,
    CloudDownload,
} from "lucide-react";

export function SecurityBanner() {
    return (
        <Card className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/20">
            <CardContent className="py-6">
                <div className="flex items-center gap-8 justify-center flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                        <Shield className="h-4 w-4 text-purple-500" />
                        <span>End-to-End Encrypted</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-4 w-4 text-purple-500" />
                        <span>Direct P2P Transfer</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-purple-500" />
                        <span>Zero-Knowledge Server</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <CloudDownload className="h-4 w-4 text-purple-500" />
                        <span>Offline Support</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
