/**
 * P2P Error Boundary
 * 
 * Catches errors in P2P components (crypto failures, WebRTC errors)
 * and displays a user-friendly error message instead of crashing.
 */
import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@stenvault/shared/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@stenvault/shared/ui/card';

interface P2PErrorBoundaryProps {
    children: ReactNode;
    fallbackComponent?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
    onRetry?: () => void;
}

interface P2PErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorType: 'crypto' | 'webrtc' | 'network' | 'unknown';
}

/**
 * Determines the type of P2P error for better user messaging
 */
function categorizeError(error: Error): P2PErrorBoundaryState['errorType'] {
    const message = error.message.toLowerCase();

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

    if (
        message.includes('rtc') ||
        message.includes('webrtc') ||
        message.includes('datachannel') ||
        message.includes('ice') ||
        message.includes('sdp')
    ) {
        return 'webrtc';
    }

    if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('timeout') ||
        message.includes('connection')
    ) {
        return 'network';
    }

    return 'unknown';
}

const ERROR_MESSAGES: Record<P2PErrorBoundaryState['errorType'], { title: string; description: string }> = {
    crypto: {
        title: 'Encryption Error',
        description: 'There was a problem with file encryption/decryption. Please try again or use a different browser.',
    },
    webrtc: {
        title: 'Connection Error',
        description: 'Failed to establish a direct connection with the other device. Check your network settings or try again.',
    },
    network: {
        title: 'Network Error',
        description: 'Unable to reach the signaling server. Please check your internet connection and try again.',
    },
    unknown: {
        title: 'Transfer Error',
        description: 'Something went wrong with the P2P transfer. Please try again.',
    },
};

export class P2PErrorBoundary extends Component<P2PErrorBoundaryProps, P2PErrorBoundaryState> {
    constructor(props: P2PErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorType: 'unknown',
        };
    }

    static getDerivedStateFromError(error: Error): Partial<P2PErrorBoundaryState> {
        return {
            hasError: true,
            error,
            errorType: categorizeError(error),
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('[P2PErrorBoundary] Caught error:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    handleRetry = (): void => {
        this.setState({ hasError: false, error: null, errorType: 'unknown' });
        this.props.onRetry?.();
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Custom fallback if provided
            if (this.props.fallbackComponent) {
                return this.props.fallbackComponent;
            }

            const { title, description } = ERROR_MESSAGES[this.state.errorType];

            return (
                <Card className="border-destructive/50 bg-destructive/5">
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
                            </CardDescription>
                        </div>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details className="w-full text-left">
                                <summary className="cursor-pointer text-xs text-muted-foreground">
                                    Technical Details
                                </summary>
                                <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                                    {this.state.error.message}
                                    {'\n\n'}
                                    {this.state.error.stack}
                                </pre>
                            </details>
                        )}

                        <Button
                            variant="outline"
                            onClick={this.handleRetry}
                            className="gap-2"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Try Again
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        return this.props.children;
    }
}

/**
 * HOC wrapper for functional components
 */
export function withP2PErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    errorBoundaryProps?: Omit<P2PErrorBoundaryProps, 'children'>
): React.FC<P> {
    const WrappedComponent: React.FC<P> = (props) => (
        <P2PErrorBoundary {...errorBoundaryProps}>
            <Component {...props} />
        </P2PErrorBoundary>
    );

    WrappedComponent.displayName = `withP2PErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

    return WrappedComponent;
}
