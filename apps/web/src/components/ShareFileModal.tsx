import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from '@stenvault/shared/lib/toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@stenvault/shared/ui/dialog';
import { Button } from '@stenvault/shared/ui/button';
import { Input } from '@stenvault/shared/ui/input';
import { Label } from '@stenvault/shared/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@stenvault/shared/ui/select';
import { Switch } from '@stenvault/shared/ui/switch';
import {
    Mail,
    Clock,
    Download,
    Lock,
    Loader2,
    Send,
    CheckCircle2,
    Copy,
    Link2,
} from 'lucide-react';
import { Badge } from '@stenvault/shared/ui/badge';
import { useTheme } from '@/contexts/ThemeContext';
import { copyToClipboard } from '@stenvault/shared/utils';
import { useMasterKey } from '@/hooks/useMasterKey';
import { createPasswordShare, createLinkShare } from '@/lib/shareCrypto';
import { extractV4FileKey } from '@/lib/hybridFile';
import { EXTERNAL_URLS } from '@/lib/constants/externalUrls';

type ShareMode = 'password' | 'link';

interface ShareFileModalProps {
    open: boolean;
    onClose: () => void;
    file: {
        id: number;
        filename: string;
        decryptedFilename?: string;
        encryptionVersion?: number | null;
        createdAt?: Date;
        encryptionSalt?: string | null;
    } | null;
}

export function ShareFileModal({ open, onClose, file }: ShareFileModalProps) {
    const { theme } = useTheme();
    const { isUnlocked, getUnlockedHybridSecretKey } = useMasterKey();
    const trpcUtils = trpc.useUtils();
    const [email, setEmail] = useState('');
    const [expiration, setExpiration] = useState<'1h' | '24h' | '7d' | '30d' | 'never'>('7d');
    const [useMaxDownloads, setUseMaxDownloads] = useState(false);
    const [maxDownloads, setMaxDownloads] = useState(10);
    const [shareMode, setShareMode] = useState<ShareMode>('password');
    const [password, setPassword] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [shareSuccess, setShareSuccess] = useState<{ link: string; expiresAt: string | null } | null>(null);

    // Plan-aware feature gates
    const { data: subscription } = trpc.stripe.getSubscription.useQuery(undefined, {
        enabled: open,
        staleTime: 60000,
    });
    const canPasswordProtect = subscription?.isAdmin || subscription?.features?.sharePasswordProtection !== false;
    const canCustomExpiry = subscription?.isAdmin || subscription?.features?.shareCustomExpiry !== false;
    const canDownloadLimits = subscription?.isAdmin || subscription?.features?.shareDownloadLimits !== false;

    // Reset gated options when subscription data confirms feature is locked
    useEffect(() => {
        if (!canPasswordProtect && shareMode === 'password') setShareMode('link');
        if (!canCustomExpiry && (expiration === '30d' || expiration === 'never')) setExpiration('7d');
        if (!canDownloadLimits && useMaxDownloads) setUseMaxDownloads(false);
    }, [canPasswordProtect, canCustomExpiry, canDownloadLimits, shareMode, expiration, useMaxDownloads]);

    const createShareMutation = trpc.shares.createShare.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const handleShare = async () => {
        if (!file) return;

        // For password mode, password is required
        if (shareMode === 'password' && (!password || password.length < 8)) {
            toast.error('Please enter a password (min 8 characters)');
            return;
        }

        const version = file.encryptionVersion ?? null;

        // Version gate: only V4 supported
        if (version !== 4) {
            toast.error('Sharing is not yet supported for this encryption version');
            return;
        }

        if (!isUnlocked) {
            toast.error('Vault is locked. Please unlock to share files.');
            return;
        }

        setIsProcessing(true);
        try {
            // Extract file key based on encryption version
            let keyBytes: Uint8Array;
            let zeroBytes: () => void;

            // V4: Extract file key from CVEF header via hybrid decapsulation
            const hybridSecretKey = await getUnlockedHybridSecretKey();
            if (!hybridSecretKey) {
                toast.error('Hybrid keys not available. Cannot share files.');
                setIsProcessing(false);
                return;
            }

            const { url: presignedUrl } = await trpcUtils.files.getDownloadUrl.fetch({ fileId: file.id });
            const extracted = await extractV4FileKey(presignedUrl, hybridSecretKey);
            keyBytes = extracted.fileKeyBytes;
            zeroBytes = extracted.zeroBytes;

            try {
                let encryptedShareKey: string;
                let shareKeyIv: string;
                let shareKeySalt: string;
                let fragmentKey: string | null = null;

                if (shareMode === 'password') {
                    const result = await createPasswordShare(keyBytes, displayName, password);
                    encryptedShareKey = result.encryptedShareKey;
                    shareKeyIv = result.shareKeyIv;
                    shareKeySalt = result.shareKeySalt;
                } else {
                    const result = await createLinkShare(keyBytes, displayName);
                    encryptedShareKey = result.encrypted.encryptedShareKey;
                    shareKeyIv = result.encrypted.shareKeyIv;
                    shareKeySalt = result.encrypted.shareKeySalt;
                    fragmentKey = result.fragmentKey;
                }

                const data = await createShareMutation.mutateAsync({
                    fileId: file.id,
                    recipientEmail: email.trim() || undefined,
                    expiration,
                    maxDownloads: useMaxDownloads ? maxDownloads : undefined,
                    password: shareMode === 'password' ? password : undefined,
                    encryptedShareKey,
                    shareKeyIv,
                    shareKeySalt,
                });

                // For link mode, append the fragment key to the URL
                let link = data.downloadLink;
                if (fragmentKey) {
                    link = `${link}#key=${fragmentKey}`;
                }

                setShareSuccess({
                    link,
                    expiresAt: data.expiresAt?.toString() || null,
                });
                toast.success('File shared successfully!');
            } finally {
                zeroBytes();
            }
        } catch (err: any) {
            if (!createShareMutation.error) {
                toast.error(err?.message || 'Failed to create share');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCopyLink = async () => {
        if (shareSuccess?.link) {
            const success = await copyToClipboard(shareSuccess.link);
            if (success) {
                toast.success('Link copied!');
            } else {
                toast.error('Failed to copy link');
            }
        }
    };

    const handleClose = () => {
        setEmail('');
        setExpiration('7d');
        setUseMaxDownloads(false);
        setMaxDownloads(10);
        setShareMode('password');
        setPassword('');
        setShareSuccess(null);
        setIsProcessing(false);
        onClose();
    };

    const getExpirationLabel = (exp: string) => {
        switch (exp) {
            case '1h': return '1 hour';
            case '24h': return '24 hours';
            case '7d': return '7 days';
            case '30d': return '30 days';
            case 'never': return 'Never';
            default: return exp;
        }
    };

    if (!file) return null;

    const displayName = file.decryptedFilename || file.filename;
    const isPending = isProcessing || createShareMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" style={{ color: theme.brand.primary }} />
                        Share File
                    </DialogTitle>
                    <DialogDescription>
                        Share <span className="font-medium text-foreground">{file.decryptedFilename || file.filename}</span>
                    </DialogDescription>
                </DialogHeader>

                {!shareSuccess ? (
                    <div className="space-y-4 py-4">
                        {/* Share Mode Toggle */}
                        <div className="space-y-2">
                            <Label>Share mode</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {canPasswordProtect ? (
                                    <Button
                                        variant={shareMode === 'password' ? 'default' : 'outline'}
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => setShareMode('password')}
                                    >
                                        <Lock className="w-4 h-4" />
                                        Password
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2 opacity-60 cursor-pointer"
                                        onClick={() => { onClose(); window.location.href = EXTERNAL_URLS.pricing; }}
                                    >
                                        <Lock className="w-3 h-3" />
                                        Password
                                        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">Pro</Badge>
                                    </Button>
                                )}
                                <Button
                                    variant={shareMode === 'link' ? 'default' : 'outline'}
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => setShareMode('link')}
                                >
                                    <Link2 className="w-4 h-4" />
                                    Link only
                                </Button>
                            </div>
                        </div>

                        {/* Email Input (optional) */}
                        <div className="space-y-2">
                            <Label htmlFor="email">
                                Recipient email
                                <span className="text-muted-foreground ml-1 font-normal">(optional)</span>
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="example@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full"
                            />
                        </div>

                        {/* Password (for password mode) */}
                        {shareMode === 'password' && (
                            <div className="space-y-2">
                                <Label htmlFor="share-password" className="flex items-center gap-2">
                                    <Lock className="w-4 h-4" />
                                    Share password
                                </Label>
                                <Input
                                    id="share-password"
                                    type="password"
                                    placeholder="Password (min 8 characters)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full"
                                    minLength={8}
                                />
                            </div>
                        )}

                        {/* Expiration Selection */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Link expiration
                            </Label>
                            <Select value={expiration} onValueChange={(v: any) => setExpiration(v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select expiration" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1h">1 hour</SelectItem>
                                    <SelectItem value="24h">24 hours</SelectItem>
                                    <SelectItem value="7d">7 days</SelectItem>
                                    {canCustomExpiry ? (
                                        <>
                                            <SelectItem value="30d">30 days</SelectItem>
                                            <SelectItem value="never">Never</SelectItem>
                                        </>
                                    ) : (
                                        <>
                                            <SelectItem value="30d" disabled className="opacity-50">
                                                30 days — Pro
                                            </SelectItem>
                                            <SelectItem value="never" disabled className="opacity-50">
                                                Never — Pro
                                            </SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Max Downloads */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-2">
                                    <Download className="w-4 h-4" />
                                    Limit downloads
                                    {!canDownloadLimits && (
                                        <Badge
                                            variant="outline"
                                            className="text-[10px] px-1 py-0 cursor-pointer"
                                            onClick={() => { onClose(); window.location.href = EXTERNAL_URLS.pricing; }}
                                        >
                                            Pro
                                        </Badge>
                                    )}
                                </Label>
                                <Switch
                                    checked={canDownloadLimits ? useMaxDownloads : false}
                                    onCheckedChange={canDownloadLimits ? setUseMaxDownloads : undefined}
                                    disabled={!canDownloadLimits}
                                    className={!canDownloadLimits ? 'opacity-50' : ''}
                                />
                            </div>
                            {useMaxDownloads && canDownloadLimits && (
                                <Input
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={maxDownloads}
                                    onChange={(e) => setMaxDownloads(Number(e.target.value))}
                                    className="w-full"
                                />
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                            {shareMode === 'password' ? (
                                <p>The recipient needs the password to decrypt and download the file.</p>
                            ) : (
                                <p>Anyone with the link can decrypt and download the file. The decryption key is embedded in the URL and never stored on the server.</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-4">
                        {/* Success State */}
                        <div className="flex flex-col items-center gap-3 py-4">
                            <div
                                className="p-3 rounded-full"
                                style={{ backgroundColor: `${theme.semantic.success}15` }}
                            >
                                <CheckCircle2 className="w-8 h-8" style={{ color: theme.semantic.success }} />
                            </div>
                            <p className="text-center font-medium">
                                {email ? 'Email sent successfully!' : 'Share link created!'}
                            </p>
                            {email && (
                                <p className="text-sm text-muted-foreground text-center">
                                    The download link was sent to <span className="font-medium">{email}</span>
                                </p>
                            )}
                        </div>

                        {/* Copy Link */}
                        <div className="flex items-center gap-2">
                            <Input
                                value={shareSuccess.link}
                                readOnly
                                className="flex-1 font-mono text-xs"
                            />
                            <Button variant="outline" size="icon" onClick={handleCopyLink} title="Copy link" aria-label="Copy link">
                                <Copy className="w-4 h-4" />
                            </Button>
                        </div>

                        {shareSuccess.expiresAt && (
                            <p className="text-xs text-muted-foreground text-center">
                                This link expires in {getExpirationLabel(expiration)}
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {!shareSuccess ? (
                        <>
                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleShare}
                                disabled={isPending || (shareMode === 'password' && password.length < 8)}
                                className="gap-2"
                            >
                                {isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Encrypting...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Share
                                    </>
                                )}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleClose} className="w-full">
                            Close
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
