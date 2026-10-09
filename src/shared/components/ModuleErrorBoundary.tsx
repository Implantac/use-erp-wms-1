import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/ui/base/button";
import { Card } from "@/ui/base/card";

interface Props {
  moduleName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Onda D — Isolates crashes per module so one broken widget/route doesn't blank the whole app.
 * Reports to console (SRE can pick up via browser telemetry) and offers recover actions.
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ModuleErrorBoundary:${this.props.moduleName}]`, error, info);
    try {
      window.dispatchEvent(
        new CustomEvent("app:module-error", {
          detail: { module: this.props.moduleName, message: error.message, stack: error.stack },
        }),
      );
    } catch {
      /* noop */
    }
  }

  private handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <Card className="max-w-lg w-full p-6 space-y-4 border-destructive/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                Falha no módulo {this.props.moduleName}
              </h2>
              <p className="text-sm text-muted-foreground">
                Isolamos o erro para não afetar o restante do sistema.
              </p>
            </div>
          </div>
          {this.state.error?.message && (
            <pre className="text-xs bg-muted/40 rounded p-3 max-h-40 overflow-auto whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={this.handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
            </Button>
            <Button size="sm" variant="outline" onClick={() => (window.location.href = "/dashboard")}>
              <Home className="h-4 w-4 mr-2" /> Voltar ao Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}

export default ModuleErrorBoundary;
