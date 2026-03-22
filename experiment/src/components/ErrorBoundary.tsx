import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: unknown) {
        console.error('Unhandled UI error:', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-6">
                    <div className="max-w-md w-full rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
                        <h1 className="text-xl font-bold text-red-800 mb-2">Something went wrong</h1>
                        <p className="text-sm text-red-700">
                            The experiment encountered an unexpected issue. Please refresh the page and try again.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
