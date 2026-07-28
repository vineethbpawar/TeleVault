import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  errorMessage?: string;
}

export interface CertificationReport {
  subsystem: string;
  version: string;
  commitHash: string;
  deviceInfo: string;
  platform: string;
  timestamp: number;
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    certified: boolean;
  };
}

const VALIDATION_HISTORY_KEY = '@televault_validation_history_v1';

class ValidationRunner {
  private activeReports: Map<string, CertificationReport> = new Map();

  async runSuite(
    subsystem: string,
    version: string,
    commitHash: string,
    deviceInfo: string,
    platform: string,
    testsToRun: { name: string; fn: () => Promise<void> }[]
  ): Promise<CertificationReport> {
    console.log(`[ValidationRunner] Executing Certification Suite for: ${subsystem}...`);
    
    const results: TestResult[] = [];
    let passedCount = 0;

    for (const test of testsToRun) {
      const start = performance.now();
      try {
        await test.fn();
        const durationMs = Math.round(performance.now() - start);
        results.push({ name: test.name, status: 'PASS', durationMs });
        passedCount++;
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - start);
        results.push({
          name: test.name,
          status: 'FAIL',
          durationMs,
          errorMessage: err.message || 'Unknown verification error'
        });
      }
    }

    const report: CertificationReport = {
      subsystem,
      version,
      commitHash,
      deviceInfo,
      platform,
      timestamp: Date.now(),
      tests: results,
      summary: {
        total: testsToRun.length,
        passed: passedCount,
        failed: testsToRun.length - passedCount,
        certified: passedCount === testsToRun.length
      }
    };

    this.activeReports.set(subsystem, report);

    console.log(
      `[ValidationRunner] Subsystem: ${subsystem} -> [${report.summary.certified ? 'CERTIFIED' : 'FAILED'}]\n` +
      `Summary: ${passedCount}/${testsToRun.length} Passed`
    );

    // Save report to historical log
    await this.persistReport(report);

    return report;
  }

  getReport(subsystem: string): CertificationReport | undefined {
    return this.activeReports.get(subsystem);
  }

  getAllReports(): CertificationReport[] {
    return Array.from(this.activeReports.values());
  }

  // Persists report validation logs
  private async persistReport(report: CertificationReport): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(VALIDATION_HISTORY_KEY);
      let history: CertificationReport[] = [];
      if (stored) {
        history = JSON.parse(stored);
      }
      history.unshift(report);
      // Keep last 50 certification runs
      if (history.length > 50) {
        history = history.slice(0, 50);
      }
      await AsyncStorage.setItem(VALIDATION_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('[ValidationRunner] Failed to persist report:', e);
    }
  }

  async getHistoricalReports(): Promise<CertificationReport[]> {
    try {
      const stored = await AsyncStorage.getItem(VALIDATION_HISTORY_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  // Generates JSON metadata export payload
  exportReportJSON(report: CertificationReport): string {
    return JSON.stringify(report, null, 2);
  }
}

export const validationRunner = new ValidationRunner();
export default validationRunner;
