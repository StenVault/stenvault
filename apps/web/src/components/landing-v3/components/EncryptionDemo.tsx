/**
 * EncryptionDemo — Live encryption visualization widget
 *
 * Left panel: auto-types demo text. Right panel: shows hex scramble in real-time.
 * Glassmorphism container with animated particle-line connector.
 */
import { useState, useEffect, useRef } from 'react';
import { LANDING_COLORS } from '../constants';

const DEMO_TEXTS = [
    'My private photos from vacation',
    'Tax returns and financial docs',
    'Personal journal entries',
    'Medical records and reports',
];

const HEX_CHARS = '0123456789abcdef';

function textToHex(text: string): string {
    // Generate continuous hex grouped in 4-char blocks (no word boundary leak)
    const charCount = text.length * 2;
    let hex = '';
    for (let i = 0; i < charCount; i++) {
        hex += HEX_CHARS[Math.floor(Math.random() * 16)];
        if ((i + 1) % 4 === 0 && i < charCount - 1) hex += ' ';
    }
    return hex;
}

export function EncryptionDemo() {
    const [currentText, setCurrentText] = useState('');
    const [hexText, setHexText] = useState('');
    const [textIndex, setTextIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const intervalRef = useRef<number>(0);

    useEffect(() => {
        const fullText = DEMO_TEXTS[textIndex % DEMO_TEXTS.length]!;

        intervalRef.current = window.setInterval(() => {
            if (!isDeleting) {
                if (charIndex < fullText.length) {
                    setCharIndex((prev) => prev + 1);
                    const partial = fullText.slice(0, charIndex + 1);
                    setCurrentText(partial);
                    setHexText(textToHex(partial));
                } else {
                    // Pause, then start deleting
                    clearInterval(intervalRef.current);
                    setTimeout(() => setIsDeleting(true), 2000);
                }
            } else {
                if (charIndex > 0) {
                    setCharIndex((prev) => prev - 1);
                    const partial = fullText.slice(0, charIndex - 1);
                    setCurrentText(partial);
                    setHexText(partial.length > 0 ? textToHex(partial) : '');
                } else {
                    setIsDeleting(false);
                    setTextIndex((prev) => prev + 1);
                }
            }
        }, isDeleting ? 30 : 60);

        return () => clearInterval(intervalRef.current);
    }, [charIndex, isDeleting, textIndex]);

    // Refresh hex display periodically for "scramble" effect
    useEffect(() => {
        if (!currentText) return;
        const interval = setInterval(() => {
            setHexText(textToHex(currentText));
        }, 150);
        return () => clearInterval(interval);
    }, [currentText]);

    return (
        <div
            className="relative rounded-2xl p-[1px] overflow-hidden"
            style={{
                background: `linear-gradient(135deg, ${LANDING_COLORS.accent}20, ${LANDING_COLORS.glassBorder}, ${LANDING_COLORS.accent}10)`,
            }}
        >
            <div
                className="rounded-2xl p-6 md:p-8 backdrop-blur-xl"
                style={{ backgroundColor: LANDING_COLORS.glassBg }}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left — Your message */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-xs font-mono tracking-wider text-slate-400 uppercase">
                                Your device
                            </span>
                        </div>
                        <div
                            className="min-h-[60px] rounded-lg p-4 font-mono text-sm"
                            style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                                border: '1px solid rgba(16, 185, 129, 0.15)',
                            }}
                        >
                            <span className="text-slate-200">
                                {currentText}
                            </span>
                            <span className="inline-block w-0.5 h-4 ml-0.5 bg-emerald-400 animate-blink align-middle" />
                        </div>
                    </div>

                    {/* Connector (visible on md+) */}
                    <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                        <div className="flex items-center gap-1">
                            <div className="w-8 h-px bg-gradient-to-r from-emerald-500/30 to-indigo-500/30" />
                            <div className="w-2 h-2 rounded-full bg-indigo-400/60 animate-pulse" />
                            <div className="w-8 h-px bg-gradient-to-r from-indigo-500/30 to-red-500/30" />
                        </div>
                    </div>

                    {/* Right — Server sees */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-xs font-mono tracking-wider text-slate-400 uppercase">
                                Our server sees
                            </span>
                        </div>
                        <div
                            className="min-h-[60px] rounded-lg p-4 font-mono text-sm overflow-hidden"
                            style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.03)',
                                border: '1px solid rgba(239, 68, 68, 0.1)',
                            }}
                        >
                            <span className="text-red-400/80 break-all">
                                {hexText || '\u00A0'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    @keyframes blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0; }
                    }
                    .animate-blink {
                        animation: blink 1s step-end infinite;
                    }
                }
            `}</style>
        </div>
    );
}
