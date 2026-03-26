/**
 * Command Palette Component
 * 
 * A quick action modal triggered by Ctrl/Cmd + K
 * Allows quick navigation, search, and actions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
    Dialog,
    DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
    Search,
    Home,
    FolderOpen,
    Settings,
    Upload,
    FolderPlus,
    LogOut,
    User,
    MessageSquare,
    Shield,
    HelpCircle,
    Star,
    ArrowLeftRight,
    Send,
    File,
    Image,
    Video,
    Music,
    FileText,
    Loader2,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilenameDecryption } from '@/hooks/useFilenameDecryption';
import { formatBytes } from '@stenvault/shared';

interface CommandItem {
    id: string;
    title: string;
    description?: string;
    icon: React.ReactNode;
    action: () => void;
    keywords?: string[];
    category: 'navigation' | 'action' | 'settings' | 'files';
}

function getFileIcon(fileType: string) {
    switch (fileType) {
        case 'image': return <Image className="w-4 h-4" />;
        case 'video': return <Video className="w-4 h-4" />;
        case 'audio': return <Music className="w-4 h-4" />;
        case 'document': return <FileText className="w-4 h-4" />;
        default: return <File className="w-4 h-4" />;
    }
}

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpload?: () => void;
    onNewFolder?: () => void;
}

export function CommandPalette({
    open,
    onOpenChange,
    onUpload,
    onNewFolder,
}: CommandPaletteProps) {
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [, setLocation] = useLocation();

    const debouncedSearch = useDebounce(search, 300);
    const { data: searchResults, isFetching: isSearching } = trpc.files.search.useQuery(
        { query: debouncedSearch, limit: 8 },
        { enabled: debouncedSearch.length >= 2 && open },
    );
    const { getDisplayName, decryptFilenames } = useFilenameDecryption();
    const [decryptedResults, setDecryptedResults] = useState<any[]>([]);

    useEffect(() => {
        if (searchResults && searchResults.length > 0) {
            decryptFilenames(searchResults as any[]).then(setDecryptedResults);
        } else {
            setDecryptedResults([]);
        }
    }, [searchResults, decryptFilenames]);

    const commands: CommandItem[] = useMemo(() => [
        {
            id: 'home',
            title: 'Go to Home',
            description: 'Overview, analytics & activity',
            icon: <Home className="w-4 h-4" />,
            action: () => setLocation('/home'),
            keywords: ['home', 'dashboard', 'inicio', 'stats', 'analytics'],
            category: 'navigation',
        },
        {
            id: 'drive',
            title: 'Go to Drive',
            description: 'File manager',
            icon: <FolderOpen className="w-4 h-4" />,
            action: () => setLocation('/drive'),
            keywords: ['drive', 'files', 'folders'],
            category: 'navigation',
        },
        {
            id: 'chat',
            title: 'Go to Chat',
            description: 'Private messaging',
            icon: <MessageSquare className="w-4 h-4" />,
            action: () => setLocation('/chat'),
            keywords: ['chat', 'messages', 'mensagens'],
            category: 'navigation',
        },
        {
            id: 'favorites',
            title: 'Go to Favorites',
            description: 'Starred files',
            icon: <Star className="w-4 h-4" />,
            action: () => setLocation('/favorites'),
            keywords: ['favorites', 'starred', 'favoritos', 'estrela'],
            category: 'navigation',
        },
        {
            id: 'transfers',
            title: 'Go to Transfer History',
            description: 'P2P transfer history',
            icon: <ArrowLeftRight className="w-4 h-4" />,
            action: () => setLocation('/transfers'),
            keywords: ['transfer', 'p2p', 'history', 'quantum', 'mesh', 'transferencias'],
            category: 'navigation',
        },
        {
            id: 'sends',
            title: 'Go to Send History',
            description: 'Encrypted file shares',
            icon: <Send className="w-4 h-4" />,
            action: () => setLocation('/sends'),
            keywords: ['send', 'history', 'share', 'enviar'],
            category: 'navigation',
        },
        {
            id: 'settings',
            title: 'Go to Settings',
            description: 'Account settings',
            icon: <Settings className="w-4 h-4" />,
            action: () => setLocation('/settings'),
            keywords: ['settings', 'config', 'configuracoes', 'account'],
            category: 'navigation',
        },
        {
            id: 'upload',
            title: 'Upload Files',
            description: 'Upload new files',
            icon: <Upload className="w-4 h-4" />,
            action: () => {
                onUpload?.();
                setLocation('/drive');
            },
            keywords: ['upload', 'add', 'new', 'carregar'],
            category: 'action',
        },
        {
            id: 'new-folder',
            title: 'New Folder',
            description: 'Create a new folder',
            icon: <FolderPlus className="w-4 h-4" />,
            action: () => {
                onNewFolder?.();
                setLocation('/drive');
            },
            keywords: ['folder', 'new', 'create', 'pasta'],
            category: 'action',
        },
        {
            id: 'profile',
            title: 'Edit Profile',
            description: 'Update your profile',
            icon: <User className="w-4 h-4" />,
            action: () => setLocation('/settings'),
            keywords: ['profile', 'user', 'perfil'],
            category: 'settings',
        },
        {
            id: 'security',
            title: 'Security Settings',
            description: 'Password and security',
            icon: <Shield className="w-4 h-4" />,
            action: () => setLocation('/settings?tab=security'),
            keywords: ['security', 'password', 'seguranca', 'senha'],
            category: 'settings',
        },
        {
            id: 'help',
            title: 'Help & Support',
            description: 'Get help',
            icon: <HelpCircle className="w-4 h-4" />,
            action: () => window.open('https://github.com/your-repo/stenvault', '_blank'),
            keywords: ['help', 'support', 'ajuda'],
            category: 'settings',
        },
        {
            id: 'logout',
            title: 'Sign Out',
            description: 'Log out of your account',
            icon: <LogOut className="w-4 h-4" />,
            action: () => setLocation('/logout'),
            keywords: ['logout', 'signout', 'exit', 'sair'],
            category: 'settings',
        },
    ], [setLocation, onUpload, onNewFolder]);

    const fileCommands: CommandItem[] = useMemo(() => {
        if (debouncedSearch.length < 2) return [];
        return decryptedResults.map((file: any) => ({
            id: `file-${file.id}`,
            title: getDisplayName(file),
            description: formatBytes(file.size),
            icon: getFileIcon(file.fileType),
            action: () => {
                const folderParam = file.folderId ? `?folder=${file.folderId}` : '';
                setLocation(`/drive${folderParam}`);
            },
            category: 'files' as const,
        }));
    }, [decryptedResults, debouncedSearch, getDisplayName, setLocation]);

    const filteredCommands = useMemo(() => {
        const baseFiltered = !search.trim()
            ? commands
            : commands.filter(cmd => {
                const searchLower = search.toLowerCase();
                const matchTitle = cmd.title.toLowerCase().includes(searchLower);
                const matchDesc = cmd.description?.toLowerCase().includes(searchLower);
                const matchKeywords = cmd.keywords?.some(k => k.includes(searchLower));
                return matchTitle || matchDesc || matchKeywords;
            });
        return [...baseFiltered, ...fileCommands];
    }, [commands, search, fileCommands]);

    const groupedCommands = useMemo(() => {
        const groups: Record<'navigation' | 'action' | 'settings' | 'files', CommandItem[]> = {
            navigation: [],
            action: [],
            settings: [],
            files: [],
        };

        filteredCommands.forEach(cmd => {
            groups[cmd.category].push(cmd);
        });

        return groups;
    }, [filteredCommands]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [search]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < filteredCommands.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev > 0 ? prev - 1 : filteredCommands.length - 1
                );
                break;
            case 'Enter': {
                e.preventDefault();
                const cmd = filteredCommands[selectedIndex];
                if (cmd) {
                    cmd.action();
                    onOpenChange(false);
                    setSearch('');
                }
                break;
            }
        }
    }, [filteredCommands, selectedIndex, onOpenChange]);

    const executeCommand = (cmd: CommandItem) => {
        cmd.action();
        onOpenChange(false);
        setSearch('');
    };

    const allCategories: ('navigation' | 'action' | 'settings' | 'files')[] = ['navigation', 'action', 'settings', 'files'];
    const getFlatIndex = (category: typeof allCategories[number], index: number): number => {
        let flatIndex = 0;
        for (const cat of allCategories) {
            if (cat === category) {
                return flatIndex + index;
            }
            flatIndex += groupedCommands[cat].length;
        }
        return flatIndex;
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[550px] p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50"
                onKeyDown={handleKeyDown}
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const cmd = filteredCommands[selectedIndex];
                        if (cmd) {
                            cmd.action();
                            onOpenChange(false);
                            setSearch('');
                        }
                    }}
                    className="flex items-center gap-3 px-4 border-b border-border/50"
                >
                    <Search className="w-5 h-5 text-muted-foreground shrink-0" />
                    <Input
                        placeholder="Type a command or search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onBlur={(e) => {
                            // Prevent dialog from closing on blur (mobile keyboard dismiss)
                            e.stopPropagation();
                        }}
                        className="border-0 shadow-none focus-visible:ring-0 text-base py-6"
                        aria-label="Search commands and files"
                        autoFocus
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="go"
                    />
                    <kbd className="hidden sm:inline-flex px-2 py-1 text-xs font-mono bg-muted rounded border border-border">
                        ESC
                    </kbd>
                </form>

                <div className="max-h-[400px] overflow-y-auto p-2">
                    {filteredCommands.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Search className="w-8 h-8 text-muted-foreground mb-3" />
                            <p className="text-sm text-muted-foreground">No commands found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groupedCommands.navigation.length > 0 && (
                                <div>
                                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Navigation
                                    </p>
                                    <div className="space-y-0.5">
                                        {groupedCommands.navigation.map((cmd, idx) => (
                                            <CommandItemComponent
                                                key={cmd.id}
                                                command={cmd}
                                                isSelected={selectedIndex === getFlatIndex('navigation', idx)}
                                                onClick={() => executeCommand(cmd)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {groupedCommands.action.length > 0 && (
                                <div>
                                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Actions
                                    </p>
                                    <div className="space-y-0.5">
                                        {groupedCommands.action.map((cmd, idx) => (
                                            <CommandItemComponent
                                                key={cmd.id}
                                                command={cmd}
                                                isSelected={selectedIndex === getFlatIndex('action', idx)}
                                                onClick={() => executeCommand(cmd)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {groupedCommands.settings.length > 0 && (
                                <div>
                                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Settings
                                    </p>
                                    <div className="space-y-0.5">
                                        {groupedCommands.settings.map((cmd, idx) => (
                                            <CommandItemComponent
                                                key={cmd.id}
                                                command={cmd}
                                                isSelected={selectedIndex === getFlatIndex('settings', idx)}
                                                onClick={() => executeCommand(cmd)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isSearching && debouncedSearch.length >= 2 && (
                                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Searching files...
                                </div>
                            )}
                            {groupedCommands.files.length > 0 && (
                                <div>
                                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Files
                                    </p>
                                    <div className="space-y-0.5">
                                        {groupedCommands.files.map((cmd, idx) => (
                                            <CommandItemComponent
                                                key={cmd.id}
                                                command={cmd}
                                                isSelected={selectedIndex === getFlatIndex('files', idx)}
                                                onClick={() => executeCommand(cmd)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {debouncedSearch.length >= 2 && !isSearching && groupedCommands.files.length === 0 && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">
                                    No files found
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-muted/30">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border">↑</kbd>
                            <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border">↓</kbd>
                            to navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border">↵</kbd>
                            to select
                        </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {filteredCommands.length} result{filteredCommands.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function CommandItemComponent({
    command,
    isSelected,
    onClick,
}: {
    command: CommandItem;
    isSelected: boolean;
    onClick: () => void;
}) {
    const { theme } = useTheme();

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                isSelected
                    ? 'text-foreground'
                    : 'hover:bg-accent text-foreground'
            )}
            style={{
                backgroundColor: isSelected ? `${theme.brand.primary}15` : undefined,
            }}
        >
            <div
                className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg',
                    !isSelected && 'bg-muted'
                )}
                style={{
                    backgroundColor: isSelected ? `${theme.brand.primary}25` : undefined,
                    color: isSelected ? theme.brand.primary : undefined,
                }}
            >
                {command.icon}
            </div>
            <div className="flex-1 min-w-0">
                <p
                    className="text-sm font-medium truncate"
                    style={{ color: isSelected ? theme.brand.primary : undefined }}
                >
                    {command.title}
                </p>
                {command.description && (
                    <p className="text-xs text-muted-foreground truncate">
                        {command.description}
                    </p>
                )}
            </div>
        </button>
    );
}
