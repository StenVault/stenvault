/**
 * MediaControls Component
 * 
 * Playback controls for video and audio files.
 */

import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Maximize2,
    Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatTime } from '../utils/formatTime';
import type { MediaState, FileType } from '../types';

interface MediaControlsProps {
    state: MediaState;
    fileType: FileType;
    onTogglePlay: () => void;
    onToggleMute: () => void;
    onVolumeChange: (value: number[]) => void;
    onSeek: (value: number[]) => void;
    onSkip: (seconds: number) => void;
    onToggleFullscreen: () => void;
}

export function MediaControls({
    state,
    fileType,
    onTogglePlay,
    onToggleMute,
    onVolumeChange,
    onSeek,
    onSkip,
    onToggleFullscreen,
}: MediaControlsProps) {
    const { isPlaying, isMuted, volume, currentTime, duration, isFullscreen } = state;

    return (
        <div className="px-4 py-4 md:py-3 border-t bg-background flex-shrink-0 safe-bottom">
            {/* Progress bar */}
            <div className="mb-4 md:mb-3">
                <Slider
                    value={[currentTime]}
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={onSeek}
                    className="cursor-pointer"
                />
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-center gap-4">
                {/* Time - Left side on desktop */}
                <span className="hidden md:block text-sm text-muted-foreground w-24">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {/* Playback controls - Always centered */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => onSkip(-10)} className="h-11 w-11" aria-label="Skip back 10 seconds">
                        <SkipBack className="w-5 h-5" />
                    </Button>
                    <Button
                        variant="default"
                        size="icon"
                        className="h-16 w-16 rounded-full shadow-lg"
                        onClick={onTogglePlay}
                        aria-label={isPlaying ? "Pause" : "Play"}
                    >
                        {isPlaying ? (
                            <Pause className="w-8 h-8" />
                        ) : (
                            <Play className="w-8 h-8 ml-1" />
                        )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onSkip(10)} className="h-11 w-11" aria-label="Skip forward 10 seconds">
                        <SkipForward className="w-5 h-5" />
                    </Button>
                </div>

                {/* Volume & fullscreen - Right side on desktop */}
                <div className="hidden md:flex items-center gap-2 w-24 justify-end">
                    <Button variant="ghost" size="icon" onClick={onToggleMute} aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}>
                        {isMuted || volume === 0 ? (
                            <VolumeX className="w-4 h-4" />
                        ) : (
                            <Volume2 className="w-4 h-4" />
                        )}
                    </Button>
                    <Slider
                        value={[isMuted ? 0 : volume]}
                        min={0}
                        max={1}
                        step={0.1}
                        onValueChange={onVolumeChange}
                        className="w-16"
                    />
                    {fileType === 'video' && (
                        <Button variant="ghost" size="icon" onClick={onToggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                            {isFullscreen ? (
                                <Minimize2 className="w-4 h-4" />
                            ) : (
                                <Maximize2 className="w-4 h-4" />
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {/* Mobile-only time display */}
            <div className="mt-3 text-center md:hidden">
                <span className="text-xs text-muted-foreground">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>
            </div>
        </div>
    );
}
