/**
 * VaultPicker - Horizontal vault switcher for mobile Drive
 *
 * Shows [My Vault] [Org1] [Org2] [+] as horizontally scrollable chips.
 * Tapping switches the active vault context for file browsing.
 */

import { motion } from 'framer-motion';
import { Shield, User, Plus } from 'lucide-react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface VaultPickerProps {
    activeOrgId: number | null;
    onSelectVault: (orgId: number | null) => void;
    onCreateVault?: () => void;
}

export function VaultPicker({ activeOrgId, onSelectVault, onCreateVault }: VaultPickerProps) {
    const { organizations } = useOrganizationContext();

    if (organizations.length === 0) return null;

    return (
        <div
            style={{
                display: 'flex',
                gap: 8,
                padding: '8px 16px',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                borderBottom: '1px solid var(--border)',
            }}
        >
            {/* Personal Vault */}
            <VaultChip
                label="My Vault"
                icon={<User size={14} />}
                isActive={activeOrgId === null}
                onClick={() => {
                    hapticTap();
                    onSelectVault(null);
                }}
            />

            {/* Organization Vaults */}
            {organizations.map(org => (
                <VaultChip
                    key={org.id}
                    label={org.name}
                    icon={<Shield size={14} />}
                    isActive={activeOrgId === org.id}
                    onClick={() => {
                        hapticTap();
                        onSelectVault(org.id);
                    }}
                />
            ))}

            {/* Create Vault */}
            {onCreateVault && (
                <VaultChip
                    label=""
                    icon={<Plus size={14} />}
                    isActive={false}
                    onClick={() => {
                        hapticTap();
                        onCreateVault();
                    }}
                    isAdd
                />
            )}
        </div>
    );
}

interface VaultChipProps {
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    isAdd?: boolean;
}

function VaultChip({ label, icon, isActive, onClick, isAdd }: VaultChipProps) {
    return (
        <motion.button
            onClick={onClick}
            whileTap={{ scale: 0.95 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: isAdd ? '6px 10px' : '6px 12px',
                borderRadius: 20,
                border: '1px solid',
                borderColor: isActive
                    ? 'var(--gold-400, rgba(212,175,55,0.6))'
                    : isAdd
                        ? 'var(--border)'
                        : 'var(--border)',
                backgroundColor: isActive
                    ? 'rgba(212,175,55,0.12)'
                    : 'transparent',
                color: isActive
                    ? 'var(--gold-400, #d4af37)'
                    : 'var(--muted-foreground)',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 150ms',
                outline: 'none',
            }}
        >
            {icon}
            {label && <span>{label}</span>}
        </motion.button>
    );
}

export default VaultPicker;
