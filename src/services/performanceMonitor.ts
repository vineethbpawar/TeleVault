import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MetricCategory = 'startup' | 'gallery' | 'upload_queue' | 'database' | 'react';

export interface PerformanceMetric {
  id: string;
  name: string;
  category: MetricCategory;
  durationMs: number;
  timestamp: number;
  platform: string;
  memorySnapshot?: number;
}

export interface BenchmarkSession {
  sessionId: string;
  commitHash: string;
  platform: string;
  metrics: { [metricName: string]: number[] }; // Collects list of runs for P95/Median
}

// Predefined budget allocations (Max durations allowed before flagging a budget fail)
const PERFORMANCE_BUDGETS: { [name: string]: number } = {
  'cold_start': 2500,
  'gallery_mount': 1000,
  'media_fetch': 500,
  'sync_computation': 500,
  'thumbnail_decode': 16,
  'search_query': 100,
  'supabase_ping': 250,
  'queue_init': 500,
};

const BENCHMARK_HISTORY_KEY = '@televault_perf_benchmark_sessions_v1';

class PerformanceMonitor {
  private activeTimers: Map<string, { startTime: number; category: MetricCategory }> = new Map();
  private metricsLog: PerformanceMetric[] = [];
  
  // Controls instrumentation overhead: 'debug' | 'internal_test' | 'production' | 'rc'
  private profilingMode: 'debug' | 'internal_test' | 'rc' | 'production' = 'debug';
  private currentSessionId = `session_${Date.now()}`;
  private gitCommit = 'cef29fd'; // Current snapshot tracking version commit

  // Session aggregate log
  private sessionRuns: { [name: string]: number[] } = {};

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      this.profilingMode = 'production';
    }
  }

  setProfilingMode(mode: 'debug' | 'internal_test' | 'rc' | 'production') {
    this.profilingMode = mode;
  }

  // Determines whether to execute tracking based on production sampling thresholds
  private shouldSample(): boolean {
    if (this.profilingMode === 'debug' || this.profilingMode === 'internal_test') return true;
    
    const random = Math.random();
    if (this.profilingMode === 'rc') {
      return random < 0.25; // 25% sampling rate
    }
    return random < 0.01; // 1% sampling rate in Production Mode
  }

  start(name: string, category: MetricCategory): void {
    if (!this.shouldSample()) return;
    this.activeTimers.set(name, {
      startTime: performance.now(),
      category,
    });
  }

  async end(name: string): Promise<PerformanceMetric | null> {
    if (!this.shouldSample()) return null;

    const timer = this.activeTimers.get(name);
    if (!timer) return null;

    this.activeTimers.delete(name);
    const durationMs = performance.now() - timer.startTime;
    
    let memorySnapshot: number | undefined;
    if (Platform.OS === 'web' && (window.performance as any)?.memory) {
      memorySnapshot = Math.round((window.performance as any).memory.usedJSHeapSize / (1024 * 1024));
    }

    const metric: PerformanceMetric = {
      id: `${name}_${Date.now()}`,
      name,
      category: timer.category,
      durationMs,
      timestamp: Date.now(),
      platform: Platform.OS,
      memorySnapshot,
    };

    this.metricsLog.push(metric);

    // Save runs inside current memory context to compute percentiles
    if (!this.sessionRuns[name]) this.sessionRuns[name] = [];
    this.sessionRuns[name].push(durationMs);

    // Evict older records to prevent local memory leaks
    if (this.metricsLog.length > 500) {
      this.metricsLog.shift();
    }

    // 1. Budget Verification Check
    const budget = PERFORMANCE_BUDGETS[name];
    const budgetStatus = budget 
      ? (durationMs <= budget ? 'PASS' : `FAIL (Budget: ${budget}ms)`) 
      : 'NO BUDGET';

    // 2. Baseline Regression Comparison
    let comparisonLabel = 'Baseline: N/A';
    try {
      const historicalBaseline = await this.getHistoricalMedian(name);
      if (historicalBaseline > 0) {
        const diffPercent = ((durationMs - historicalBaseline) / historicalBaseline) * 100;
        if (diffPercent > 15) {
          comparisonLabel = `⚠ Regression (+${diffPercent.toFixed(1)}% vs. Baseline ${historicalBaseline.toFixed(1)}ms)`;
        } else if (diffPercent < -15) {
          comparisonLabel = `Improved (${diffPercent.toFixed(1)}% vs. Baseline ${historicalBaseline.toFixed(1)}ms)`;
        } else {
          comparisonLabel = `Stable (${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(1)}% vs. Baseline)`;
        }
      }
    } catch (_) {}

    if (this.profilingMode === 'debug') {
      console.log(
        `[Profiler] [${timer.category.toUpperCase()}] ${name} -> [${budgetStatus}]\n` +
        `-------------------------\n` +
        `Duration: ${durationMs.toFixed(1)} ms\n` +
        `Status: ${comparisonLabel}\n` +
        `Platform: ${Platform.OS.toUpperCase()}\n` +
        `Memory JS Heap: ${memorySnapshot ? `${memorySnapshot} MB` : 'N/A'}\n` +
        `-------------------------`
      );
    }

    return metric;
  }

  // Persists current runs list to AsyncStorage as baseline benchmark
  async persistBenchmarkSession(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(BENCHMARK_HISTORY_KEY);
      let history: BenchmarkSession[] = [];
      if (stored) {
        history = JSON.parse(stored);
      }

      const newSession: BenchmarkSession = {
        sessionId: this.currentSessionId,
        commitHash: this.gitCommit,
        platform: Platform.OS,
        metrics: this.sessionRuns,
      };

      // Keep last 15 historical benchmark runs
      history.unshift(newSession);
      if (history.length > 15) {
        history = history.slice(0, 15);
      }

      await AsyncStorage.setItem(BENCHMARK_HISTORY_KEY, JSON.stringify(history));
      console.log(`[Profiler] Successfully persisted benchmark session: ${this.currentSessionId}`);
    } catch (e) {
      console.error('[Profiler] Failed to persist session data:', e);
    }
  }

  private async getHistoricalMedian(name: string): Promise<number> {
    try {
      const stored = await AsyncStorage.getItem(BENCHMARK_HISTORY_KEY);
      if (!stored) return 0;

      const history: BenchmarkSession[] = JSON.parse(stored);
      const values: number[] = [];

      history.forEach(session => {
        const runs = session.metrics[name];
        if (runs && runs.length > 0) {
          values.push(...runs);
        }
      });

      if (values.length === 0) return 0;
      values.sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    } catch (_) {
      return 0;
    }
  }

  // Percentiles (Average, Median, P95, Worst) helper calculations
  getPercentiles(name: string): { avg: number; median: number; p95: number; worst: number; count: number } | null {
    const runs = this.sessionRuns[name];
    if (!runs || runs.length === 0) return null;

    const sorted = [...runs].sort((a, b) => a - b);
    const count = sorted.length;
    const avg = sorted.reduce((sum, v) => sum + v, 0) / count;
    const median = sorted[Math.floor(count * 0.5)];
    const p95 = sorted[Math.min(count - 1, Math.floor(count * 0.95))];
    const worst = sorted[count - 1];

    return { avg, median, p95, worst, count };
  }

  getMetrics(category?: MetricCategory): PerformanceMetric[] {
    if (category) {
      return this.metricsLog.filter(m => m.category === category);
    }
    return this.metricsLog;
  }

  clearMetrics(): void {
    this.metricsLog = [];
    this.sessionRuns = {};
  }
}

export const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;
