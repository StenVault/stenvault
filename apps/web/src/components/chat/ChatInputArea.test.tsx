import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInputArea } from "./ChatInputArea";

// Mock useChatLocalUpload - the component now uses this instead of direct tRPC calls
const { mockUploadAndShare } = vi.hoisted(() => ({
    mockUploadAndShare: vi.fn(),
}));

vi.mock("@/hooks/useChatLocalUpload", () => ({
    useChatLocalUpload: () => ({
        uploadAndShare: mockUploadAndShare,
        isUploading: false,
        hasKeys: true,
    }),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, className, ...props }: React.ComponentProps<"div">) => (
            <div className={className} {...props}>{children}</div>
        ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock UI components
vi.mock("@/components/ui/button", () => ({
    Button: ({ children, onClick, disabled, className, ...props }: any) => (
        <button
            onClick={onClick}
            disabled={disabled}
            className={className}
            aria-label={props["aria-label"]}
            {...props}
        >
            {children}
        </button>
    ),
}));

vi.mock("@/components/ui/textarea", () => ({
    Textarea: ({ value, onChange, onKeyDown, onFocus, onBlur, placeholder, className, onInput, ...props }: any) => (
        <textarea
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            className={className}
            onInput={onInput}
            {...props}
        />
    ),
}));

vi.mock("@/components/ui/progress", () => ({
    Progress: ({ value, className }: any) => (
        <div data-testid="progress" className={className} role="progressbar" aria-valuenow={value} />
    ),
}));

vi.mock("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: any) => <>{children}</>,
    TooltipContent: ({ children }: any) => <span className="tooltip-content">{children}</span>,
    TooltipProvider: ({ children }: any) => <>{children}</>,
    TooltipTrigger: ({ children, asChild }: any) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
    Send: () => <span data-testid="send-icon">Send</span>,
    Paperclip: () => <span data-testid="paperclip-icon">Paperclip</span>,
    Image: () => <span data-testid="image-icon">Image</span>,
    FileText: () => <span data-testid="filetext-icon">FileText</span>,
    X: () => <span data-testid="x-icon">X</span>,
    Loader2: () => <span data-testid="loader-icon">Loader</span>,
    Vault: () => <span data-testid="vault-icon">Vault</span>,
    AlertCircle: () => <span data-testid="alert-icon">Alert</span>,
}));

// Mock FileShareModal
vi.mock("./FileShareModal", () => ({
    FileShareModal: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
        open ? (
            <div data-testid="file-share-modal">
                <button onClick={() => onOpenChange(false)}>Close Modal</button>
            </div>
        ) : null,
}));

// Mock cn utility
vi.mock("@/lib/utils", () => ({
    cn: (...classes: any[]) => classes.filter(Boolean).join(" "),
}));

// Mock tRPC for subscription query
vi.mock("@/lib/trpc", () => ({
    trpc: {
        stripe: {
            getSubscription: {
                useQuery: () => ({ data: { features: { chatFileMaxSize: 25 * 1024 * 1024 } } }),
            },
        },
    },
}));

// Mock formatBytes from shared
vi.mock("@cloudvault/shared", () => ({
    formatBytes: (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`,
}));

describe("ChatInputArea", () => {
    const mockOnSendMessage = vi.fn();
    const mockOnTypingChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const renderComponent = (props = {}) => {
        return render(
            <ChatInputArea
                onSendMessage={mockOnSendMessage}
                onTypingChange={mockOnTypingChange}
                {...props}
            />
        );
    };

    describe("rendering", () => {
        it("should render textarea with placeholder", () => {
            renderComponent();
            expect(screen.getByPlaceholderText("Type your message...")).toBeInTheDocument();
        });

        it("should render attachment button with paperclip icon", () => {
            renderComponent();
            expect(screen.getByTestId("paperclip-icon")).toBeInTheDocument();
        });

        it("should render send button with send icon", () => {
            renderComponent();
            expect(screen.getByTestId("send-icon")).toBeInTheDocument();
        });

        it("should render keyboard hints", () => {
            renderComponent();
            expect(screen.getByText("Enter")).toBeInTheDocument();
            expect(screen.getByText("send")).toBeInTheDocument();
            expect(screen.getByText("Shift + Enter")).toBeInTheDocument();
            expect(screen.getByText("new line")).toBeInTheDocument();
        });

        it("should render hidden file input", () => {
            renderComponent();
            const fileInput = document.querySelector('input[type="file"]');
            expect(fileInput).toBeInTheDocument();
            expect(fileInput).toHaveClass("hidden");
        });

        it("should not render vault button without recipientUserId", () => {
            renderComponent();
            expect(screen.queryByTestId("vault-icon")).not.toBeInTheDocument();
        });

        it("should render vault button when recipientUserId provided", () => {
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });
            expect(screen.getByTestId("vault-icon")).toBeInTheDocument();
        });
    });

    describe("message input", () => {
        it("should update message value on input", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Hello world");

            expect(textarea).toHaveValue("Hello world");
        });

        it("should call onTypingChange(true) when typing", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "H");

            expect(mockOnTypingChange).toHaveBeenCalledWith(true);
        });

        it("should call onTypingChange(false) after 1 second timeout", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "H");

            expect(mockOnTypingChange).toHaveBeenCalledWith(true);

            vi.advanceTimersByTime(1000);

            expect(mockOnTypingChange).toHaveBeenCalledWith(false);
        });

        it("should reset typing timeout on continuous typing", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "H");

            vi.advanceTimersByTime(500);
            await user.type(textarea, "i");

            vi.advanceTimersByTime(500);
            // Should not have called false yet because we reset the timer
            const falseCalls = mockOnTypingChange.mock.calls.filter(
                (call) => call[0] === false
            );
            expect(falseCalls.length).toBe(0);

            vi.advanceTimersByTime(500);
            expect(mockOnTypingChange).toHaveBeenCalledWith(false);
        });
    });

    describe("send button states", () => {
        it("should disable send button when message is empty", () => {
            renderComponent();
            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            expect(sendButton).toBeDisabled();
        });

        it("should enable send button when message has content", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Hello");

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            expect(sendButton).not.toBeDisabled();
        });

        it("should disable send button with whitespace-only message", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "   ");

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            expect(sendButton).toBeDisabled();
        });
    });

    describe("sending messages", () => {
        it("should call onSendMessage with trimmed text on button click", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "  Hello world  ");

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            expect(mockOnSendMessage).toHaveBeenCalledWith("Hello world");
        });

        it("should clear message after sending", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Hello");

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            expect(textarea).toHaveValue("");
        });

        it("should call onTypingChange(false) after sending", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Hello");

            mockOnTypingChange.mockClear();

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            expect(mockOnTypingChange).toHaveBeenCalledWith(false);
        });

        it("should not send empty message", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            expect(mockOnSendMessage).not.toHaveBeenCalled();
        });
    });

    describe("keyboard shortcuts", () => {
        it("should send message on Enter key", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Hello");
            await user.keyboard("{Enter}");

            expect(mockOnSendMessage).toHaveBeenCalledWith("Hello");
        });

        it("should not send on Shift+Enter (new line)", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent();

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Hello");
            await user.keyboard("{Shift>}{Enter}{/Shift}");

            expect(mockOnSendMessage).not.toHaveBeenCalled();
        });
    });

    describe("file attachment", () => {
        it("should show file preview when file is attached", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123 });

            const file = new File(["test content"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);

            expect(screen.getByText("test.pdf")).toBeInTheDocument();
        });

        it("should show file size in preview", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123 });

            const content = "x".repeat(2048); // 2KB
            const file = new File([content], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);

            expect(screen.getByText(/2\.0 KB/i)).toBeInTheDocument();
        });

        it("should enable send button when file is attached (even without message)", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123 });

            const file = new File(["test"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            expect(sendButton).not.toBeDisabled();
        });

        it("should remove file when X button clicked", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123 });

            const file = new File(["test"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);
            expect(screen.getByText("test.pdf")).toBeInTheDocument();

            // Find button with X icon
            const xIcon = screen.getByTestId("x-icon");
            const removeButton = xIcon.closest("button");
            await user.click(removeButton!);

            expect(screen.queryByText("test.pdf")).not.toBeInTheDocument();
        });

        it("should show image icon for image files", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123 });

            const file = new File(["test"], "photo.jpg", { type: "image/jpeg" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);

            expect(screen.getByText("photo.jpg")).toBeInTheDocument();
            // Image files show image-icon in preview
            expect(screen.getAllByTestId("image-icon").length).toBeGreaterThan(0);
        });
    });

    describe("file size validation", () => {
        it("should reject files larger than plan limit", async () => {
            const { toast } = await import("sonner");
            renderComponent({ recipientUserId: 123 });

            // Create a mock file with custom size property (exceeds 25MB plan limit)
            const largeFile = new File(["x"], "large.zip", { type: "application/zip" });
            Object.defineProperty(largeFile, "size", { value: 26 * 1024 * 1024, writable: false });

            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            Object.defineProperty(fileInput, 'files', {
                value: [largeFile],
                writable: false,
            });
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            expect(toast.error).toHaveBeenCalledWith("Maximum file size: 25 MB");
            expect(screen.queryByText("large.zip")).not.toBeInTheDocument();
        });

        it("should accept files under plan limit", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123 });

            const file = new File(["test"], "small.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);

            expect(screen.getByText("small.pdf")).toBeInTheDocument();
        });
    });

    describe("file upload flow", () => {
        it("should call uploadAndShare when sending with a file", async () => {
            mockUploadAndShare.mockResolvedValueOnce({
                fileId: 1,
                shareId: 2,
                messageId: 3,
            });

            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });

            const file = new File(["test"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            await waitFor(() => {
                expect(mockUploadAndShare).toHaveBeenCalledWith(
                    expect.objectContaining({
                        file: expect.any(File),
                        recipientUserId: 123,
                        permission: "download",
                        expiresIn: "7d",
                    })
                );
            });
        });

        it("should clear input after successful upload", async () => {
            mockUploadAndShare.mockResolvedValueOnce({
                fileId: 1,
                shareId: 2,
                messageId: 3,
            });

            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });

            const file = new File(["test"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);
            expect(screen.getByText("test.pdf")).toBeInTheDocument();

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            await waitFor(() => {
                expect(screen.queryByText("test.pdf")).not.toBeInTheDocument();
            });
        });

        it("should not call onSendMessage when file is attached (upload handles it)", async () => {
            mockUploadAndShare.mockResolvedValueOnce({
                fileId: 1,
                shareId: 2,
                messageId: 3,
            });

            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });

            const file = new File(["test"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

            await user.upload(fileInput, file);

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            await waitFor(() => {
                expect(mockUploadAndShare).toHaveBeenCalled();
            });
            // onSendMessage is NOT called for file messages - uploadAndShare handles the whole flow
            expect(mockOnSendMessage).not.toHaveBeenCalled();
        });
    });

    describe("vault button", () => {
        it("should open FileShareModal when vault button clicked", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });

            const vaultIcon = screen.getByTestId("vault-icon");
            const vaultButton = vaultIcon.closest("button");
            await user.click(vaultButton!);

            expect(screen.getByTestId("file-share-modal")).toBeInTheDocument();
        });

        it("should close FileShareModal when close button clicked", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });

            const vaultIcon = screen.getByTestId("vault-icon");
            const vaultButton = vaultIcon.closest("button");
            await user.click(vaultButton!);

            expect(screen.getByTestId("file-share-modal")).toBeInTheDocument();

            const closeButton = screen.getByText("Close Modal");
            await user.click(closeButton);

            expect(screen.queryByTestId("file-share-modal")).not.toBeInTheDocument();
        });
    });

    describe("combined text and file", () => {
        it("should include message content when uploading with text", async () => {
            mockUploadAndShare.mockResolvedValueOnce({
                fileId: 1,
                shareId: 2,
                messageId: 3,
            });

            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Check this file");

            const file = new File(["test"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            await user.upload(fileInput, file);

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            await waitFor(() => {
                expect(mockUploadAndShare).toHaveBeenCalledWith(
                    expect.objectContaining({
                        messageContent: "Check this file",
                    })
                );
            });
        });

        it("should clear both text and file after sending", async () => {
            mockUploadAndShare.mockResolvedValueOnce({
                fileId: 1,
                shareId: 2,
                messageId: 3,
            });

            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            renderComponent({ recipientUserId: 123, recipientName: "Test User" });

            const textarea = screen.getByPlaceholderText("Type your message...");
            await user.type(textarea, "Check this file");

            const file = new File(["test"], "test.pdf", { type: "application/pdf" });
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            await user.upload(fileInput, file);

            const sendButtons = screen.getAllByRole("button");
            const sendButton = sendButtons.find(btn => btn.querySelector('[data-testid="send-icon"]'));
            await user.click(sendButton!);

            await waitFor(() => {
                expect(textarea).toHaveValue("");
                expect(screen.queryByText("test.pdf")).not.toBeInTheDocument();
            });
        });
    });
});
