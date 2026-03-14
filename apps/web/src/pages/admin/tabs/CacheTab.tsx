/**
 * Admin Panel - Cache Tab
 * Cache statistics and management
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ServerCog,
    RefreshCw,
    Trash2,
    AlertTriangle,
} from "lucide-react";

interface CacheTabProps {
    cacheStats: any;
    cacheLoading: boolean;
    refetchCache: () => void;
    onFlushCaches: () => void;
    flushPending: boolean;
}

export function CacheTab({
    cacheStats,
    cacheLoading,
    refetchCache,
    onFlushCaches,
    flushPending,
}: CacheTabProps) {
    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                {/* Cache Statistics */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ServerCog className="h-5 w-5" />
                            Cache Statistics
                        </CardTitle>
                        <CardDescription>
                            Current cache usage and performance metrics
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {cacheLoading ? (
                            <div className="text-sm text-muted-foreground">Loading cache stats...</div>
                        ) : !cacheStats ? (
                            <div className="text-sm text-muted-foreground">No cache statistics available</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Cache Status</span>
                                    <Badge variant={cacheStats.enabled ? "default" : "secondary"}>
                                        {cacheStats.enabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Total Keys</span>
                                    <Badge variant="secondary">{cacheStats.totalKeys || 0}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Folder Cache Keys</span>
                                    <Badge variant="outline" className="text-blue-500">{cacheStats.folderCacheKeys || 0}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Stats Cache Keys</span>
                                    <Badge variant="outline" className="text-green-500">{cacheStats.statsCacheKeys || 0}</Badge>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Cache Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Cache Actions</CardTitle>
                        <CardDescription>
                            Manage application cache. Use with caution!
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 border rounded-lg space-y-3">
                            <div className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">Refresh Cache Stats</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Reload the current cache statistics from the server.
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => refetchCache()}
                                disabled={cacheLoading}
                                className="w-full"
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${cacheLoading ? "animate-spin" : ""}`} />
                                Refresh Stats
                            </Button>
                        </div>

                        <div className="p-4 border border-destructive/30 rounded-lg space-y-3 bg-destructive/5">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                                <span className="font-medium text-destructive">Flush All Caches</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Clear all cached data. This may temporarily slow down the application as caches rebuild.
                            </p>
                            <Button
                                variant="destructive"
                                onClick={onFlushCaches}
                                disabled={flushPending}
                                className="w-full"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Flush All Caches
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
