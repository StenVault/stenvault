import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Download,
    FileIcon,
    FileText,
    FileImage,
    FileVideo,
    FileAudio,
    Loader2,
    Clock,
    User,
    XCircle,
    CheckCircle2,
    Lock,
    Shield,
} from 'lucide-react';
import { type FileType } from '@stenvault/shared';
import { formatBytes } from '@/utils/formatters';
import { Progress } from '@/components/ui/progress';
import {
    decryptPasswordShare,
    decryptLinkShare,
    isLinkShare,
} from '@/lib/shareCrypto';
import { decryptV4ChunkedToStream } from '@/lib/streamingDecrypt';
import { streamDownloadToDisk } from '@/lib/platform';

function getFileIcon(fileType: FileType) {
    const iconClass = 'w-16 h-16';
    switch (fileType) {
        case 'image': return <FileImage className={`${iconClass} text-green-500`} />;
        case 'video': return <FileVideo className={`${iconClass} text-purple-500`} />;
        case 'audio': return <FileAudio className={`${iconClass} text-orange-500`} />;
        case 'document': return <FileText className={`${iconClass} text-blue-500`} />;
        default: return <FileIcon className={`${iconClass} text-gray-500`} />;
    }
}

type DownloadState = 'idle' | 'downloading' | 'decrypting' | 'complete' | 'error';

export default function SharedDownload() {
    const { shareCode } = useParams<{ shareCode: string }>();
    const [downloadState, setDownloadState] = useState<DownloadState>('idle');
    const [progress, setProgress] = useState(0);
    const [password, setPassword] = useState('');
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Extract URL fragment key (never sent to server)
    const fragmentKey = useMemo(() => {
        const match = window.location.hash.match(/key=([A-Za-z0-9_-]+)/);
        return match ? match[1] : null;
    }, []);

    const { data: shareInfo, isLoading, error } = trpc.shares.getShareInfo.useQuery(
        { shareCode: shareCode || '' },
        { enabled: !!shareCode, retry: false }
    );

    useEffect(() => {
        if (shareInfo?.hasPassword && !shareInfo?.isLinkShare) {
            setShowPasswordInput(true);
        }
    }, [shareInfo]);

    const downloadMutation = trpc.shares.downloadShared.useMutation();

    const handleDownload = useCallback(async () => {
        if (!shareCode) return;

        // For password-protected shares, require password entry
        if (shareInfo?.hasPassword && !shareInfo?.isLinkShare && !password) {
            toast.error('Please enter the share password');
            return;
        }

        setDownloadState('downloading');
        setProgress(0);
        setErrorMessage('');

        try {
            const data = await downloadMutation.mutateAsync({
                shareCode,
                password: password || undefined,
            });

            // No share key data = legacy share (pre-encryption redesign)
            if (!data.shareKeyData) {
                toast.error('This is a legacy share without decryption support.');
                setDownloadState('error');
                setErrorMessage('This share was created before encrypted sharing was available. The file cannot be decrypted.');
                return;
            }

            // Determine share type and decrypt the share payload
            let fileKeyBytes: Uint8Array;
            let displayFilename: string;

            const shareKeyData = data.shareKeyData;

            if (isLinkShare(shareKeyData.salt)) {
                // Link-only share: key from URL fragment
                if (!fragmentKey) {
                    setDownloadState('error');
                    setErrorMessage('Missing decryption key. Make sure you have the complete link including the #key=... part.');
                    return;
                }
                const result = await decryptLinkShare(shareKeyData, fragmentKey);
                fileKeyBytes = result.fileKeyBytes;
                displayFilename = result.filename;
            } else {
                // Password-protected share
                if (!password) {
                    setDownloadState('error');
                    setErrorMessage('Password is required to decrypt this file.');
                    return;
                }
                try {
                    const result = await decryptPasswordShare(shareKeyData, password);
                    fileKeyBytes = result.fileKeyBytes;
                    displayFilename = result.filename;
                } catch {
                    setDownloadState('error');
                    setErrorMessage('Incorrect password. Could not decrypt the file.');
                    return;
                }
            }

            // Import file key as AES-GCM CryptoKey
            const fileKey = await crypto.subtle.importKey(
                'raw',
                fileKeyBytes.buffer.slice(fileKeyBytes.byteOffset, fileKeyBytes.byteOffset + fileKeyBytes.byteLength) as ArrayBuffer,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt'],
            );
            // Zero raw bytes
            fileKeyBytes.fill(0);

            const encVersion = data.encryptionVersion ?? 4;
            if (encVersion !== 4) {
                throw new Error(`Unsupported encryption version: ${encVersion}`);
            }

            const mimeType = data.mimeType || 'application/octet-stream';

            // V4 chunked: streaming decrypt → streaming download (minimal RAM)
            const response = await fetch(data.url);
            if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);

            const contentLength = Number(response.headers.get('content-length') || 0);

            const plaintextStream = decryptV4ChunkedToStream(response.body, {
                fileKey,
                onProgress: (p) => setProgress(Math.round((p.chunkIndex / p.chunkCount) * 100)),
            });

            setDownloadState('decrypting');

            await streamDownloadToDisk(plaintextStream, {
                filename: displayFilename,
                totalSize: contentLength > 0 ? contentLength : undefined,
                mimeType,
            });

            setDownloadState('complete');
        } catch (err: any) {
            console.error('Share download error:', err);
            setDownloadState('error');
            setErrorMessage(err?.message || 'Failed to download and decrypt file');
        }
    }, [shareCode, shareInfo, password, fragmentKey, downloadMutation]);

    // Auto-download for link shares (no password needed)
    useEffect(() => {
        if (shareInfo && fragmentKey && shareInfo.isLinkShare && !shareInfo.hasPassword && downloadState === 'idle') {
            handleDownload();
        }
    }, [shareInfo, fragmentKey, downloadState, handleDownload]);

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-8 pb-8">
                        <div className="flex flex-col items-center text-center">
                            <div className="p-4 rounded-full bg-red-100 dark:bg-red-900 mb-4">
                                <XCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                            </div>
                            <h2 className="text-xl font-semibold mb-2">Invalid Link</h2>
                            <p className="text-muted-foreground">
                                {(error as any)?.message || 'This share link is invalid or has expired.'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!shareInfo) return null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-xl">
                <CardHeader className="text-center border-b">
                    <div className="flex justify-center mb-4">
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50">
                            {getFileIcon(shareInfo.file.fileType as FileType)}
                        </div>
                    </div>
                    <CardTitle className="text-xl">Shared File</CardTitle>
                    <CardDescription className="flex items-center justify-center gap-2 mt-2">
                        <User className="w-4 h-4" />
                        Shared by {shareInfo.sharedBy}
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                            <p className="text-muted-foreground">Size</p>
                            <p className="font-medium">{formatBytes(shareInfo.file.size)}</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                            <p className="text-muted-foreground">Type</p>
                            <p className="font-medium capitalize">{shareInfo.file.fileType}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center">
                        {shareInfo.expiresAt && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                                <Clock className="w-3 h-3" />
                                Expires {new Date(shareInfo.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        )}
                        {shareInfo.downloadsRemaining !== null && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                                <Download className="w-3 h-3" />
                                {shareInfo.downloadsRemaining} downloads remaining
                            </div>
                        )}
                        {shareInfo.hasPassword && !shareInfo.isLinkShare && (
                            <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-1 rounded-full">
                                <Lock className="w-3 h-3" />
                                Password protected
                            </div>
                        )}
                        {shareInfo.hasShareKey && (
                            <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-1 rounded-full">
                                <Shield className="w-3 h-3" />
                                End-to-end encrypted
                            </div>
                        )}
                    </div>

                    {/* Password input for password-protected shares */}
                    {showPasswordInput && downloadState !== 'complete' && (
                        <div className="space-y-2">
                            <Label htmlFor="password" className="flex items-center gap-2">
                                <Lock className="w-4 h-4" />
                                Password
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleDownload();
                                }}
                                className="w-full"
                                disabled={downloadState !== 'idle' && downloadState !== 'error'}
                            />
                        </div>
                    )}

                    {/* Error state */}
                    {downloadState === 'error' && errorMessage && (
                        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                            <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
                        </div>
                    )}

                    {/* Progress states */}
                    {downloadState === 'downloading' && (
                        <div className="space-y-2">
                            <p className="text-sm text-center text-muted-foreground">Downloading encrypted file...</p>
                            <Progress value={progress} className="h-2" />
                        </div>
                    )}

                    {downloadState === 'decrypting' && (
                        <div className="flex flex-col items-center gap-2 py-2">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Decrypting file...</p>
                        </div>
                    )}

                    {/* Action buttons */}
                    {(downloadState === 'idle' || downloadState === 'error') && (
                        <Button
                            className="w-full h-12 text-lg gap-2"
                            onClick={handleDownload}
                            disabled={downloadMutation.isPending}
                        >
                            <Download className="w-5 h-5" />
                            Download File
                        </Button>
                    )}

                    {downloadState === 'complete' && (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                            </div>
                            <p className="font-medium">Download complete!</p>
                            <Button variant="outline" onClick={() => {
                                setDownloadState('idle');
                                setProgress(0);
                            }}>
                                Download again
                            </Button>
                        </div>
                    )}

                    <div className="text-center pt-4 border-t">
                        <p className="text-xs text-muted-foreground">
                            Shared via{' '}
                            <span className="font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                StenVault
                            </span>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
