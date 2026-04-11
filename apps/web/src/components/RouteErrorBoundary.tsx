/**
 * Route Error Boundary
 *
 * Catches errors in route components and displays a user-friendly error message
 * with error categorization and retry functionality.
 */
import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ArrowLeft, Send, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

interface RouteErrorBoundaryProps {
    children: ReactNode;
    routeName?: string;
    fallbackComponent?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
    onRetry?: () => void;
}

interface RouteErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorType: ErrorType;
    retryKey: number;
    reportStatus: 'idle' | 'sending' | 'sent' | 'failed';
}

type ErrorType = 'network' | 'auth' | 'validation' | 'crypto' | 'unknown';

/**
 * Determines the type of error for better user messaging
 */
function categorizeError(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('offline') ||
        message.includes('failed to fetch') ||
        name.includes('networkerror')
    ) {
        return 'network';
    }

    // Authentication errors
    if (
        message.includes('unauthorized') ||
        message.includes('unauthenticated') ||
        message.includes('forbidden') ||
        message.includes('401') ||
        message.includes('403') ||
        message.includes('session') ||
        message.includes('token') ||
        message.includes('login')
    ) {
        return 'auth';
    }

    // Validation errors
    if (
        message.includes('invalid') ||
        message.includes('validation') ||
        message.includes('required') ||
        message.includes('must be') ||
        message.includes('cannot be')
    ) {
        return 'validation';
    }

    // Crypto errors
    if (
        message.includes('crypto') ||
        message.includes('decrypt') ||
        message.includes('encrypt') ||
        message.includes('key') ||
        message.includes('aes') ||
        message.includes('rsa')
    ) {
        return 'crypto';
    }

    return 'unknown';
}

const ERROR_MESSAGES: Record<ErrorType, { title: string; description: string }> = {
    network: {
        title: 'Connection Error',
        description: 'Unable to connect to the server. Please check your internet connection and try again.',
    },
    auth: {
        title: 'Authentication Error',
        description: 'Your session may have expired. Please try logging in again.',
    },
    validation: {
        title: 'Validation Error',
        description: 'Some data was invalid. Please refresh and try again.',
    },
    crypto: {
        title: 'Encryption Error',
        description: 'There was a problem with encryption. Please try again or use a different browser.',
    },
    unknown: {
        title: 'Something Went Wrong',
        description: 'An unexpected error occurred. Please try again.',
    },
};

/**
 * Log error to monitoring service (placeholder for future integration)
 */
function logError(error: Error, errorInfo: React.ErrorInfo, routeName?: string): void {
    // In development, log to console with full details
    if (import.meta.env.DEV) {
        console.error('[RouteErrorBoundary] Error caught:', {
            route: routeName,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
            componentStack: errorInfo.componentStack,
        });
    } else {
        // In production, log minimal info (could send to monitoring service)
        console.error('[RouteErrorBoundary] Error in route:', routeName, error.message);
    }
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
    constructor(props: RouteErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorType: 'unknown',
            retryKey: 0,
            reportStatus: 'idle',
        };
    }

    static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
        return {
            hasError: true,
            error,
            errorType: categorizeError(error),
            reportStatus: 'idle',
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        logError(error, errorInfo, this.props.routeName);
        this.props.onError?.(error, errorInfo);
    }

    componentDidUpdate(prevProps: RouteErrorBoundaryProps): void {
        // Reset error state when navigating to a different route within the same layout.
        // Without this, React reuses the class instance (same type, same Outlet position)
        // and the error state persists across route changes.
        if (prevProps.routeName !== this.props.routeName && this.state.hasError) {
            this.setState({
                hasError: false,
                error: null,
                errorType: 'unknown',
                retryKey: this.state.retryKey + 1,
                reportStatus: 'idle',
            });
        }
    }

    handleRetry = (): void => {
        if (this.state.errorType === 'network') {
            // Network errors: full page reload to re-establish connection
            window.location.reload();
            return;
        }
        // Other errors: remount children to retry rendering
        this.setState((prevState) => ({
            hasError: false,
            error: null,
            errorType: 'unknown',
            retryKey: prevState.retryKey + 1,
            reportStatus: 'idle',
        }));
        this.props.onRetry?.();
    };

    handleGoHome = (): void => {
        window.location.href = '/home';
    };

    handleGoBack = (): void => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = '/home';
        }
    };

    handleSendReport = async (): Promise<void> => {
        if (this.state.reportStatus === 'sending' || this.state.reportStatus === 'sent') return;

        this.setState({ reportStatus: 'sending' });

        try {
            const report = {
                errorType: this.state.errorType,
                errorMessage: (this.state.error?.message || 'Unknown error').slice(0, 500),
                errorStack: this.state.error?.stack?.slice(0, 3000),
                route: this.props.routeName || 'unknown',
                url: window.location.href.slice(0, 500),
                userAgent: navigator.userAgent.slice(0, 500),
                timestamp: new Date().toISOString(),
            };

            const res = await fetch('/api/trpc/errorReport.submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ json: report }),
            });

            if (res.ok) {
                this.setState({ reportStatus: 'sent' });
            } else {
                this.setState({ reportStatus: 'failed' });
            }
        } catch {
            this.setState({ reportStatus: 'failed' });
        }
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Custom fallback if provided
            if (this.props.fallbackComponent) {
                return this.props.fallbackComponent;
            }

            const { title, description } = ERROR_MESSAGES[this.state.errorType];
            const routeLabel = this.props.routeName ? ` in ${this.props.routeName}` : '';
            const { reportStatus } = this.state;
            const isNetwork = this.state.errorType === 'network';

            return (
                <div className="flex items-center justify-center min-h-[400px] p-4">
                    <Card className="w-full max-w-md border-destructive/50 bg-destructive/5">
                        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
                            <div className="rounded-full bg-destructive/10 p-3">
                                <AlertTriangle className="h-8 w-8 text-destructive" />
                            </div>

                            <div className="space-y-2">
                                <CardTitle className="text-lg text-destructive">
                                    {title}
                                </CardTitle>
                                <CardDescription>
                                    {description}
                                    {routeLabel && (
                                        <span className="block mt-1 text-xs text-muted-foreground">
                                            Error occurred{routeLabel}
                                        </span>
                                    )}
                                </CardDescription>
                            </div>

                            {import.meta.env.DEV && this.state.error && (
                                <details className="w-full text-left">
                                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                        Technical Details (Development Only)
                                    </summary>
                                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs font-mono">
                                        {this.state.error.name}: {this.state.error.message}
                                        {'\n\n'}
                                        {this.state.error.stack}
                                    </pre>
                                </details>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2 w-full">
                                <Button
                                    variant="outline"
                                    onClick={this.handleRetry}
                                    className="gap-2 flex-1"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Try Again
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={this.handleGoBack}
                                    className="gap-2 flex-1"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Go Back
                                </Button>
                                <Button
                                    variant="default"
                                    onClick={this.handleGoHome}
                                    className="gap-2 flex-1"
                                >
                                    <Home className="h-4 w-4" />
                                    Home
                                </Button>
                            </div>

                            {/* Send Report — hidden for network errors (server unreachable) */}
                            {!isNetwork && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={this.handleSendReport}
                                    disabled={reportStatus === 'sending' || reportStatus === 'sent'}
                                    className="gap-2 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    {reportStatus === 'sending' && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {reportStatus === 'sent' && <Check className="h-3 w-3 text-emerald-400" />}
                                    {reportStatus === 'idle' && <Send className="h-3 w-3" />}
                                    {reportStatus === 'failed' && <Send className="h-3 w-3" />}
                                    {reportStatus === 'idle' && 'Send Error Report'}
                                    {reportStatus === 'sending' && 'Sending...'}
                                    {reportStatus === 'sent' && 'Report Sent'}
                                    {reportStatus === 'failed' && 'Retry Report'}
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>
            );
        }

        // Use retryKey to force full remount on retry, ensuring fresh data fetches
        return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
    }
}

export default RouteErrorBoundary;
