import { createTRPCReact } from "@trpc/react-query";
// Import AppRouter type from api-types package (type-only, safe for browser)
import type { AppRouter } from "@cloudvault/api-types";

export const trpc = createTRPCReact<AppRouter>();
