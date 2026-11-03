import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  title?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  public reset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error || new Error('Unknown error'), this.reset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex-1 min-h-[220px] flex flex-col items-center justify-center p-6 text-center bg-panel rounded-lg border border-line m-4">
          <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="font-display text-sm font-semibold text-ink mb-1">
            {this.props.title || 'Đã xảy ra sự cố hiển thị'}
          </h3>
          <p className="text-xs text-ink-2 max-w-sm mb-4 leading-relaxed">
            {this.state.error?.message || 'Thành phần giao diện này không thể hiển thị bình thường.'}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-accent-ink text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Thử lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
