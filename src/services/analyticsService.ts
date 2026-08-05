import { supabase } from '../lib/supabase';
import { Platform } from 'react-native';

export type AnalyticsEventType =
  | 'sign_up'
  | 'login'
  | 'photo_uploaded'
  | 'video_uploaded'
  | 'memory_opened'
  | 'snap_viewed'
  | 'search_used'
  | 'session_duration'
  | 'daily_active_user'
  | 'app_crash'
  | 'ad_impression'
  | 'ad_click';

export interface AnalyticsEvent {
  event_name: AnalyticsEventType;
  user_id?: string;
  metadata?: Record<string, any>;
  platform?: string;
  created_at?: string;
}

class AnalyticsService {
  private sessionStartTime: number = Date.now();

  constructor() {
    this.trackSessionStart();
    this.setupGlobalErrorHandler();
  }

  private trackSessionStart() {
    this.sessionStartTime = Date.now();
    this.trackEvent('daily_active_user', {
      timestamp: new Date().toISOString(),
    });
  }

  public trackSessionEnd() {
    const durationSeconds = Math.floor((Date.now() - this.sessionStartTime) / 1000);
    this.trackEvent('session_duration', {
      duration_seconds: durationSeconds,
    });
  }

  /**
   * Track an analytics event.
   * Logs locally in dev/PWA and pushes to Supabase analytics table.
   */
  public async trackEvent(
    eventName: AnalyticsEventType,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || 'anonymous';

      const payload = {
        event_name: eventName,
        user_id: userId,
        platform: Platform.OS,
        metadata: {
          ...metadata,
          app_version: '1.0.0',
          screen_width: Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : undefined,
        },
      };

      console.log(`[ANALYTICS] Tracked: ${eventName}`, payload);

      // Async log to Supabase analytics_events table (fail silent to avoid blocking UI)
      (async () => {
        try {
          await supabase.from('analytics_events').insert([payload]);
        } catch (_) {}
      })();
    } catch (err) {
      console.warn('[ANALYTICS] Event tracking error:', err);
    }
  }

  /**
   * Capture uncaught global JS errors for crash reporting.
   */
  private setupGlobalErrorHandler() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.trackEvent('app_crash', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.trackEvent('app_crash', {
          reason: String(event.reason),
          stack: event.reason?.stack,
        });
      });
    }
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
