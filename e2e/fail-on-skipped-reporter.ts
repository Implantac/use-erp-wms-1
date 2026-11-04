import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// O comando de homologação não pode anunciar sucesso com testes ignorados.
export default class FailOnSkippedReporter implements Reporter {
  private skipped = 0;
  private executed = 0;
  onTestEnd(_test: TestCase, result: TestResult) {
    if (result.status === 'skipped') this.skipped++;
    else this.executed++;
  }
  onEnd(_result: FullResult): { status: 'failed' } | void {
    if (this.skipped || !this.executed) {
      console.error(`E2E incompleto: ${this.skipped} ignorado(s), ${this.executed} executado(s).`);
      return { status: 'failed' };
    }
  }
}
