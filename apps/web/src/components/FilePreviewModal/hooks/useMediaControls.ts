/**
 * useMediaControls Hook
 * 
 * Manages media playback controls for video and audio elements.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { debugWarn } from '@/lib/debugLogger';
import type { MediaState } from '../types';

interface UseMediaControlsParams {
    onReset?: () => void;
}

interface UseMediaControlsReturn {
    // State
    state: MediaState;

    // Refs
    videoRef: React.RefObject<HTMLVideoElement | null>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    videoContainerRef: React.RefObject<HTMLDivElement | null>;

    // Controls
    togglePlay: () => void;
    toggleMute: () => void;
    handleVolumeChange: (value: number[]) => void;
    handleSeek: (value: number[]) => void;
    skip: (seconds: number) => void;
    toggleFullscreen: () => Promise<void>;

    // Event handlers
    handleLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => void;
    handleTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => void;
    handleEnded: () => void;
    handleMediaError: (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => void;

    // Reset
    reset: () => void;
    setLoading: (loading: boolean) => void;
}

export function useMediaControls({ onReset }: UseMediaControlsParams = {}): UseMediaControlsReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoContainerRef = useRef<HTMLDivElement>(null);

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    const reset = useCallback(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setIsLoading(true);
        setError(null);
        onReset?.();
    }, [onReset]);

    const togglePlay = useCallback(() => {
        const media = videoRef.current || audioRef.current;
        if (!media) return;

        if (isPlaying) {
            media.pause();
            setIsPlaying(false);
        } else {
            media.play()
                .then(() => {
                    setIsPlaying(true);
                })
                .catch((err: Error) => {
                    setIsPlaying(false);
                    const message = err.name === 'NotAllowedError'
                        ? 'Playback blocked by browser. Click the video to play.'
                        : err.name === 'NotSupportedError'
                            ? 'Format not supported - This codec is not supported by your browser. Try downloading the file.'
                            : `Playback failed - ${err.message}`;
                    setError(message);
                    debugWarn('[media]', 'media.play() rejected', { name: err.name, message: err.message });
                });
        }
    }, [isPlaying]);

    const toggleMute = useCallback(() => {
        const media = videoRef.current || audioRef.current;
        if (!media) return;

        media.muted = !isMuted;
        setIsMuted(!isMuted);
    }, [isMuted]);

    const handleVolumeChange = useCallback((value: number[]) => {
        const newVolume = value[0];
        const media = videoRef.current || audioRef.current;
        if (media && typeof newVolume === 'number') {
            media.volume = newVolume;
            setVolume(newVolume);
            setIsMuted(newVolume === 0);
        }
    }, []);

    const handleSeek = useCallback((value: number[]) => {
        const newTime = value[0];
        const media = videoRef.current || audioRef.current;
        if (media && typeof newTime === 'number') {
            media.currentTime = newTime;
            setCurrentTime(newTime);
        }
    }, []);

    const skip = useCallback((seconds: number) => {
        const media = videoRef.current || audioRef.current;
        if (media) {
            media.currentTime = Math.max(0, Math.min(duration, media.currentTime + seconds));
        }
    }, [duration]);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (!isFullscreen) {
                const target = videoContainerRef.current;
                if (target?.requestFullscreen) {
                    await target.requestFullscreen();
                }
            } else {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                }
            }
        } catch (err) {
            debugWarn('[media]', 'Fullscreen error', err);
        }
    }, [isFullscreen]);

    const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
        setDuration(e.currentTarget.duration);
        setIsLoading(false);
        setError(null);
    }, []);

    const handleTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
        setCurrentTime(e.currentTarget.currentTime);
    }, []);

    const handleEnded = useCallback(() => {
        setIsPlaying(false);
    }, []);

    const handleMediaError = useCallback((e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
        const target = e.currentTarget;
        const mediaError = target.error;
        setIsLoading(false);

        let errorMessage = 'Error loading media';
        let errorDetails = '';

        if (mediaError) {
            switch (mediaError.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    errorMessage = 'Loading aborted';
                    errorDetails = 'The loading was cancelled.';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    errorMessage = 'Network error';
                    errorDetails = 'Check your connection or if the URL has expired.';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    errorMessage = 'Codec not supported';
                    errorDetails = 'This video uses a codec (e.g., H.265/HEVC) not supported by the browser. Try downloading the file.';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = 'Format not supported';
                    errorDetails = 'The format or codec of this file is not supported. Try another browser or download the file.';
                    break;
            }
        }

        setError(`${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}`);
    }, []);

    return {
        state: {
            isPlaying,
            isMuted,
            volume,
            currentTime,
            duration,
            isFullscreen,
            error,
        },
        videoRef,
        audioRef,
        videoContainerRef,
        togglePlay,
        toggleMute,
        handleVolumeChange,
        handleSeek,
        skip,
        toggleFullscreen,
        handleLoadedMetadata,
        handleTimeUpdate,
        handleEnded,
        handleMediaError,
        reset,
        setLoading: setIsLoading,
    };
}
