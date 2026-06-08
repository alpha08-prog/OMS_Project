import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Optional custom fallback. Falls back to the default card if omitted. */
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Catches render-time errors anywhere in the routed tree so a single bad page
 * shows a recovery card instead of blanking the whole app. Error boundaries
 * must be class components — there is no hook equivalent.
 *
 * This only changes the failure path (uncaught render error → fallback); the
 * happy path is untouched.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a console trail for debugging; no external reporting wired up.
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          Something went wrong
        </h1>
        <p className="max-w-md text-sm text-gray-600">
          An unexpected error occurred while loading this page. Please reload to
          try again.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Reload page
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
