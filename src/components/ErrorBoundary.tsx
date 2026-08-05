import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[school-hub] render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-100 p-6">
          <div className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-5">
            <p className="text-sm font-semibold text-rose-600">Something broke</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-rose-700">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="mt-3 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
