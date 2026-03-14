/**
 * Stats Card Component
 * Displays a stat with icon and optional description
 */
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: React.ReactNode;
    trend?: "up" | "down" | "neutral";
    className?: string;
}

export function StatsCard({ title, value, description, icon, className }: StatsCardProps) {
    return (
        <Card className={cn("bg-card/50 backdrop-blur-sm border-border/50", className)}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <p className="text-2xl font-bold mt-1">{value}</p>
                        {description && (
                            <p className="text-xs text-muted-foreground mt-1">{description}</p>
                        )}
                    </div>
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
