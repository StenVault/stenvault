/**
 * FileEmptyState Component
 * 
 * Empty state display when no files or folders exist.
 */

import { motion } from 'framer-motion';
import { Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileEmptyStateProps {
    onUploadRequest?: () => void;
}

export function FileEmptyState({ onUploadRequest }: FileEmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center justify-center py-24 text-center relative overflow-hidden rounded-2xl border border-dashed border-border/50 bg-card/30"
        >
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/5 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center">
                <div className="p-6 rounded-full bg-background/50 border border-white/10 shadow-lg backdrop-blur-sm mb-6 relative group">
                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Sparkles className="w-10 h-10 text-primary animate-pulse-slow" />
                </div>

                <h3 className="text-2xl font-semibold tracking-tight mb-3 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    This folder is waiting for ideas
                </h3>
                <p className="text-muted-foreground max-w-sm mb-8 text-base">
                    This space is ready for your next big project. Drag files here or...
                </p>

                <div className="flex gap-4">
                    <Button
                        onClick={onUploadRequest}
                        size="lg"
                        variant="glow"
                        className="shadow-xl shadow-primary/20 hover:shadow-primary/40"
                    >
                        <Upload className="w-5 h-5" />
                        Upload
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}
