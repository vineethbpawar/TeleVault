import { Platform } from 'react-native';

export type MetricCategory = 'startup' | 'gallery' | 'upload_queue' | 'database' | 'react';

export interface PerformanceMetric {
  id: string;
  name: string;
  category: MetricCategory;
  durationMs: number;
  timestamp: number;
  platform: string;
  memorySnapshot?: number; // In MB where available
}

class PerformanceMonitor {
  private activeTimers: Map<string, { startTime: number; category: MetricCategory }> = new Map();
  private metricsLog: PerformanceMetric[] = [];
  
  // Controls instrumentation overhead: 'debug' | 'internal_test' | 'production'
  private profilingMode: 'debug' | 'internal_test' | 'production' = 'debug';

  constructor() {
    // Disable logging overhead automatically in production builds
    if (process.env.NODE_ENV === 'production') {
      this.profilingMode = 'production';
    }
  }

  setProfilingMode(mode: 'debug' | 'internal_test' | 'production') {
    this.profilingMode = mode;
  }

  getProfilingMode() {
    return this.profilingMode;
  }

  start(name: string, category: MetricCategory): void {
    if (this.profilingMode === 'production') return;
    this.activeTimers.set(name, {
      startTime: performance.now(),
      category,
    });
  }

  end(name: string): PerformanceMetric | null {
    if (this.profilingMode === 'production') return null;

    const timer = this.activeTimers.get(name);
    if (!timer) return null;

    this.activeTimers.delete(name);
    const durationMs = performance.now() - timer.startTime;
    
    // Simple mock memory snapshot check if supported (like in Chrome/V8 environments)
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

    // Limit log array size to prevent memory leaks in dev
    if (this.metricsLog.length > 500) {
      this.metricsLog.shift();
    }

    if (this.profilingMode === 'debug') {
      console.log(
        `[Profiler] [${timer.category.toUpperCase()}] ${name}\n` +
        `-------------------------\n` +
        `Duration: ${durationMs.toFixed(1)} ms\n` +
        `Platform: ${Platform.OS.toUpperCase()}\n` +
        `Memory JS Heap: ${memorySnapshot ? `${memorySnapshot} MB` : 'N/A'}\n` +
        `-------------------------`
      );
    }

    return metric;
  }

  getMetrics(category?: MetricCategory): PerformanceMetric[] {
    if (category) {
      return this.metricsLog.filter(m => m.category === category);
    }
    return this.metricsLog;
  }

  clearMetrics(): void {
    this.metricsLog = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;
