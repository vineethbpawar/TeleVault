import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { AppNotification } from '../types/notifications';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificationService = {
  /**
   * Request push notification permissions and save token to Supabase.
   */
  async registerForPushNotifications(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return null;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Failed to get push token for push notification!');
        return null;
      }

      // Get Expo push token
      // Note: projectId is required when using Expo Go, but is automatically set in app.json if configured.
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Upsert push token into supabase
        const { error } = await supabase
          .from('user_push_tokens')
          .upsert({
            user_id: user.id,
            token: token
          }, {
            onConflict: 'token'
          });

        if (error) {
          console.error('Error saving push token to Supabase:', error);
        }
      }

      // Register notification category for incoming calls
      await Notifications.setNotificationCategoryAsync('incoming_call', [
        {
          identifier: 'answer',
          buttonTitle: 'Answer',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'decline',
          buttonTitle: 'Decline',
          options: { opensAppToForeground: false },
        },
      ]);

      // Setup Android channel if needed
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFD700', // Yellow accent
        });

        await Notifications.setNotificationChannelAsync('incoming-calls', {
          name: 'Incoming Calls',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 500, 500, 500, 500, 500],
          lightColor: '#FFFC00',
          sound: 'default',
        });
      }

      return token;
    } catch (error) {
      console.error('registerForPushNotifications error:', error);
      return null;
    }
  },

  /**
   * Fetch in-app notifications list.
   */
  async getNotifications(): Promise<AppNotification[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in.');

    const { data, error } = await supabase
      .from('notifications')
      .select('*, sender:profiles!notifications_sender_id_fkey(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get Notifications Error:', error);
      throw new Error(error.message || 'Failed to fetch notifications.');
    }

    return (data || []) as AppNotification[];
  },

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('Mark Notifications Read Error:', error);
    }
  },

  /**
   * Trigger / Send a local notification and save to Database.
   * This is a complete mock/in-app implementation of the backend push service.
   */
  async sendNotification(
    targetUserId: string,
    title: string,
    body: string,
    type: AppNotification['type'],
    dataPayload: any = {}
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const senderId = user ? user.id : null;

      // 1. Save notification to DB for the receiver
      const { error: dbError } = await supabase
        .from('notifications')
        .insert({
          user_id: targetUserId,
          sender_id: senderId,
          title,
          body,
          type,
          data: dataPayload,
          is_read: false
        });

      if (dbError) {
        console.error('Error inserting notification to DB:', dbError);
      }

      // 2. If target user is the current user, trigger local notification instantly
      const isCall = dataPayload?.type === 'incoming_call';

      if (user && targetUserId === user.id) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: dataPayload,
            categoryIdentifier: isCall ? 'incoming_call' : undefined,
            channelId: isCall ? 'incoming-calls' : 'default',
          } as any,
          trigger: null, // instant
        });
      } else {
        // Send a push notification if token exists (via Expo's push endpoint)
        // Since we are running on client, we check if we can fetch user's token and do a direct fetch.
        // In production, this would be handled by a Supabase Edge Function or Telegram bot backend.
        const { data: tokenRows } = await supabase
          .from('user_push_tokens')
          .select('token')
          .eq('user_id', targetUserId);

        if (tokenRows && tokenRows.length > 0) {
          for (const row of tokenRows) {
            try {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  'Accept': 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: row.token,
                  title: title,
                  body: body,
                  data: dataPayload,
                  categoryIdentifier: isCall ? 'incoming_call' : undefined,
                  channelId: isCall ? 'incoming-calls' : 'default',
                  priority: isCall ? 'high' : 'normal',
                }),
              });
            } catch (err) {
              console.warn('Expo Push fetch failed:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error('sendNotification error:', error);
    }
  }
};

export default notificationService;
