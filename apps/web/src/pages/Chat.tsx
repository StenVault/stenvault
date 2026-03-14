/**
 * Chat Page
 *
 * Displays chat with premium redesigned UI.
 * Uses MobileChat for mobile devices.
 */
import { ChatLayout } from "@/components/chat/ChatLayout";
import { MobileChat } from "@/components/mobile-v2/pages/MobileChat";
import { useIsMobile } from "@/hooks/useMobile";
import { useChatFileShareEvents } from "@/hooks/useChatFileShareEvents";
import "@/components/chat/chat-animations.css";

export function Chat() {
    const isMobile = useIsMobile();

    // Listen for file share events (revoke, new shares)
    useChatFileShareEvents();

    // Mobile: Use dedicated MobileChat component
    if (isMobile) {
        return <MobileChat />;
    }

    // Desktop: Use original ChatLayout
    return (
        <div className="h-full">
            <ChatLayout />
        </div>
    );
}

export default Chat;
