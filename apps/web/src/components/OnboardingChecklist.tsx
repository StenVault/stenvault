/**
 * OnboardingChecklist - Guides new users through key features
 *
 * Shows a checklist of tasks to complete:
 * - Upload first file
 * - Configure encryption key
 * - Share a file
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
    Upload,
    Check,
    X,
    ChevronRight,
    PartyPopper,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";

interface OnboardingTask {
    id: string;
    icon: React.ElementType;
    title: string;
    description: string;
    path: string;
    completed: boolean;
}

const ONBOARDING_STORAGE_KEY = "cloudvault-onboarding-dismissed";
const ONBOARDING_COMPLETED_KEY = "cloudvault-onboarding-completed";

export function OnboardingChecklist() {
    const [, setLocation] = useLocation();
    const [isDismissed, setIsDismissed] = useState(true); // Start dismissed, check on mount
    const [isCompleted, setIsCompleted] = useState(false);
    const { user } = useAuth();

    // Determine task completion based on available data
    const hasUploadedFile = (user?.storageUsed ?? 0) > 0;

    const tasks: OnboardingTask[] = [
        {
            id: "upload",
            icon: Upload,
            title: "Upload your first file",
            description: "Drag & drop or click to upload securely",
            path: "/drive",
            completed: hasUploadedFile,
        },
    ];

    const completedTasks = tasks.filter(t => t.completed);
    const progress = (completedTasks.length / tasks.length) * 100;

    // Check if onboarding should be shown
    useEffect(() => {
        const dismissed = localStorage.getItem(ONBOARDING_STORAGE_KEY);
        const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY);

        if (completed === "true") {
            setIsCompleted(true);
            setIsDismissed(true);
        } else if (dismissed !== "true") {
            setIsDismissed(false);
        }
    }, []);

    // Check if all tasks completed
    useEffect(() => {
        if (completedTasks.length === tasks.length) {
            setIsCompleted(true);
            localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
        }
    }, [completedTasks.length, tasks.length]);

    const handleDismiss = () => {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        setIsDismissed(true);
    };

    const handleTaskClick = (task: OnboardingTask) => {
        if (!task.completed) {
            setLocation(task.path);
        }
    };

    if (isDismissed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ duration: 0.3 }}
            >
                <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {isCompleted ? (
                                    <PartyPopper className="w-5 h-5 text-primary" />
                                ) : (
                                    <Sparkles className="w-5 h-5 text-primary" />
                                )}
                                <CardTitle className="text-base">
                                    {isCompleted ? "All done!" : "Get Started with CloudVault"}
                                </CardTitle>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={handleDismiss}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <Progress value={progress} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground">
                                {completedTasks.length}/{tasks.length}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 pb-4">
                        <div className="space-y-2">
                            {tasks.map((task) => (
                                <button
                                    key={task.id}
                                    onClick={() => handleTaskClick(task)}
                                    disabled={task.completed}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left",
                                        task.completed
                                            ? "bg-primary/5 opacity-60"
                                            : "hover:bg-accent/50 cursor-pointer"
                                    )}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center",
                                        task.completed
                                            ? "bg-primary/20"
                                            : "bg-muted"
                                    )}>
                                        {task.completed ? (
                                            <Check className="w-4 h-4 text-primary" />
                                        ) : (
                                            <task.icon className="w-4 h-4 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            "text-sm font-medium",
                                            task.completed && "line-through"
                                        )}>
                                            {task.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {task.description}
                                        </p>
                                    </div>
                                    {!task.completed && (
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}
