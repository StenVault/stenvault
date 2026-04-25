import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrgAuditLogs } from "./OrgAuditLogs";

// ═══════════════════════════════════════════════
//  Mocks
// ═══════════════════════════════════════════════

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: vi.fn(() => mockNavigate),
}));

let mockSubscription: any = null;
vi.mock("@/lib/trpc", () => ({
    trpc: {
        stripe: {
            getSubscription: {
                useQuery: vi.fn(() => ({ data: mockSubscription })),
            },
        },
    },
}));

const mockSetPage = vi.fn();
let mockAuditReturn = {
    logs: [] as any[],
    total: 0,
    isLoading: false,
    error: null,
    page: 0,
    setPage: mockSetPage,
    limit: 20,
};
vi.mock("@/hooks/organizations/useOrganizations", () => ({
    useOrgAuditLogs: vi.fn(() => mockAuditReturn),
}));

vi.mock("lucide-react", () => ({
    Activity: () => <span data-testid="icon-activity" />,
    ChevronLeft: () => <span data-testid="icon-chevron-left" />,
    ChevronRight: () => <span data-testid="icon-chevron-right" />,
    Clock: () => <span data-testid="icon-clock" />,
    User: () => <span data-testid="icon-user" />,
    Lock: () => <span data-testid="icon-lock" />,
}));

// ═══════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════

const SAMPLE_LOGS = [
    {
        id: 1,
        createdAt: "2026-03-15T10:30:00Z",
        action: "upload",
        resourceType: "file",
        resourceId: "42",
        userEmail: "alice@acme.com",
        userId: 10,
        success: true,
    },
    {
        id: 2,
        createdAt: "2026-03-15T09:15:00Z",
        action: "login_failed",
        resourceType: null,
        resourceId: null,
        userEmail: "bob@acme.com",
        userId: 11,
        success: false,
    },
];

function withBusinessPlan() {
    mockSubscription = {
        isAdmin: false,
        features: { orgAuditLogs: true },
        limits: {},
    };
}

function withProPlan() {
    mockSubscription = {
        isAdmin: false,
        features: { orgAuditLogs: false },
        limits: {},
    };
}

function withAdminUser() {
    mockSubscription = {
        isAdmin: true,
        features: { orgAuditLogs: false },
        limits: {},
    };
}

// ═══════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════

describe("OrgAuditLogs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubscription = null;
        mockAuditReturn = {
            logs: [],
            total: 0,
            isLoading: false,
            error: null,
            page: 0,
            setPage: mockSetPage,
            limit: 20,
        };
    });

    // ─── Plan Gate ──────────────────────────────

    it("renders nothing while subscription is loading", () => {
        mockSubscription = undefined;
        const { container } = render(<OrgAuditLogs organizationId={1} />);
        expect(container.innerHTML).toBe("");
    });

    it("shows upsell card when plan lacks orgAuditLogs", () => {
        withProPlan();
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText("Audit Logs")).toBeInTheDocument();
        expect(screen.getByText(/available on the Business plan/i)).toBeInTheDocument();
        expect(screen.getByText("View plans")).toBeInTheDocument();
    });

    it("navigates to subscription settings on upsell click", async () => {
        withProPlan();
        render(<OrgAuditLogs organizationId={1} />);

        await userEvent.click(screen.getByText("View plans"));
        expect(mockNavigate).toHaveBeenCalledWith("/settings/billing");
    });

    it("shows audit table for Business plan users", () => {
        withBusinessPlan();
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText("Audit Logs")).toBeInTheDocument();
        expect(screen.getByText(/Total:/)).toBeInTheDocument();
        expect(screen.queryByText(/Business plan/i)).not.toBeInTheDocument();
    });

    it("shows audit table for admin users regardless of plan", () => {
        withAdminUser();
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText(/Total:/)).toBeInTheDocument();
        expect(screen.queryByText(/Business plan/i)).not.toBeInTheDocument();
    });

    // ─── Table States ───────────────────────────

    it("shows empty state when no logs exist", () => {
        withBusinessPlan();
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
    });

    it("shows loading skeletons while fetching", () => {
        withBusinessPlan();
        mockAuditReturn = { ...mockAuditReturn, isLoading: true };
        const { container } = render(<OrgAuditLogs organizationId={1} />);

        const pulseRows = container.querySelectorAll(".animate-pulse");
        expect(pulseRows.length).toBe(5);
    });

    it("renders log rows with correct data", () => {
        withBusinessPlan();
        mockAuditReturn = { ...mockAuditReturn, logs: SAMPLE_LOGS, total: 2 };
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText("alice@acme.com")).toBeInTheDocument();
        expect(screen.getByText("bob@acme.com")).toBeInTheDocument();
        expect(screen.getByText("upload")).toBeInTheDocument();
        expect(screen.getByText("login failed")).toBeInTheDocument();
        expect(screen.getByText("SUCCESS")).toBeInTheDocument();
        expect(screen.getByText("FAILED")).toBeInTheDocument();
    });

    it("shows resource type and ID for applicable logs", () => {
        withBusinessPlan();
        mockAuditReturn = { ...mockAuditReturn, logs: SAMPLE_LOGS, total: 2 };
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText("file #42")).toBeInTheDocument();
    });

    it("falls back to user ID when email is missing", () => {
        withBusinessPlan();
        const logNoEmail = [{ ...SAMPLE_LOGS[0], userEmail: null }];
        mockAuditReturn = { ...mockAuditReturn, logs: logNoEmail, total: 1 };
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText("ID: 10")).toBeInTheDocument();
    });

    // ─── Pagination ─────────────────────────────

    it("displays correct page info", () => {
        withBusinessPlan();
        mockAuditReturn = { ...mockAuditReturn, total: 60, page: 1 };
        render(<OrgAuditLogs organizationId={1} />);

        expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });

    it("disables previous button on first page", () => {
        withBusinessPlan();
        mockAuditReturn = { ...mockAuditReturn, total: 40, page: 0 };
        render(<OrgAuditLogs organizationId={1} />);

        const buttons = screen.getAllByRole("button");
        const prevBtn = buttons.find((b) => b.querySelector("[data-testid='icon-chevron-left']"));
        expect(prevBtn).toBeDisabled();
    });

    it("disables next button on last page", () => {
        withBusinessPlan();
        mockAuditReturn = { ...mockAuditReturn, total: 20, page: 0 };
        render(<OrgAuditLogs organizationId={1} />);

        const buttons = screen.getAllByRole("button");
        const nextBtn = buttons.find((b) => b.querySelector("[data-testid='icon-chevron-right']"));
        expect(nextBtn).toBeDisabled();
    });
});
