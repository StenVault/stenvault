/**
 * DeviceIcon — Shared device icon component (Single Source of Truth)
 *
 * Renders the appropriate Lucide icon based on device type and platform.
 * Replaces duplicated getPlatformIcon() in TrustedDevicesSettings and DeviceApprovalModal.
 */

import { Smartphone, Laptop, Tablet, Monitor, type LucideProps } from "lucide-react";

interface DeviceIconProps extends LucideProps {
    platform?: string;
    deviceType?: string | null;
}

export function DeviceIcon({ platform, deviceType, ...props }: DeviceIconProps) {
    // deviceType has priority over platform (more specific)
    const type = deviceType?.toLowerCase() || platform?.toLowerCase() || "";

    switch (type) {
        case "mobile":
        case "ios":
        case "android":
            return <Smartphone {...props} />;
        case "tablet":
            return <Tablet {...props} />;
        case "desktop":
        case "macos":
        case "windows":
        case "linux":
            return <Laptop {...props} />;
        default:
            return <Monitor {...props} />;
    }
}
