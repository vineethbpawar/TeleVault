import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { ArrowLeft, Send, CheckCircle, HelpCircle } from 'lucide-react-native';
import AppInput from '../components/AppInput';
import AppButton from '../components/AppButton';
import { telegramService } from '../services/telegramService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'TelegramConnect'>;

export const TelegramConnectScreen: React.FC<Props> = ({ navigation, route }) => {
  const fromSettings = route.params?.fromSettings ?? false;

  const [botToken, setBotToken] = useState('');
  const [channelId, setChannelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  // Load existing config if available
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await telegramService.getTelegramConfig();
        if (config.botToken) setBotToken(config.botToken);
        if (config.channelId) setChannelId(config.channelId);
      } catch (error) {
        console.error('Failed to load Telegram config:', error);
      }
    };
    loadConfig();
  }, []);

  const handleSave = async () => {
    if (!botToken.trim() || !channelId.trim()) {
      Alert.alert('Error', 'Please fill in both fields.');
      return;
    }

    setLoading(true);
    try {
      await telegramService.saveTelegramConfig(botToken, channelId);
      Alert.alert('Success', 'Telegram configuration saved successfully!', [
        {
          text: 'OK',
          onPress: () => {
            if (fromSettings) {
              navigation.goBack();
            } else {
              navigation.replace('Main', { screen: 'CameraTab' });
            }
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!botToken.trim() || !channelId.trim()) {
      Alert.alert('Error', 'Please fill in bot token and channel ID before testing.');
      return;
    }

    setTesting(true);
    try {
      await telegramService.testTelegramConnection(botToken, channelId);
      Alert.alert('Success', 'Connection test passed! Check your Telegram channel for the verification message.');
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Check your credentials and try again.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          {fromSettings && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <ArrowLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Telegram Sync</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Sync Configuration</Text>
            <Text style={styles.subtitle}>
              TeleVault stores files in your private Telegram channel. All traffic goes directly to Telegram Bot API.
            </Text>

            <AppInput
              label="Telegram Bot Token"
              placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsT..."
              value={botToken}
              onChangeText={setBotToken}
              autoCapitalize="none"
              autoCorrect={false}
              isPassword={true}
            />

            <AppInput
              label="Private Channel ID"
              placeholder="e.g. -1001234567890"
              value={channelId}
              onChangeText={setChannelId}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.actionButtons}>
              <AppButton
                title="Test Connection"
                onPress={handleTestConnection}
                variant="secondary"
                loading={testing}
                style={styles.halfButton}
              />
              <AppButton
                title="Save & Sync"
                onPress={handleSave}
                loading={loading}
                style={styles.halfButton}
              />
            </View>
          </View>

          <View style={styles.instructionsCard}>
            <View style={styles.instructionsHeader}>
              <HelpCircle size={20} color="#FFFC00" style={{ marginRight: 8 }} />
              <Text style={styles.instructionsTitle}>Setup Guide</Text>
            </View>

            <View style={styles.step}>
              <Text style={styles.stepNum}>1</Text>
              <Text style={styles.stepText}>
                Open Telegram and search for <Text style={styles.bold}>@BotFather</Text>.
              </Text>
            </View>

            <View style={styles.step}>
              <Text style={styles.stepNum}>2</Text>
              <Text style={styles.stepText}>
                Send <Text style={styles.bold}>/newbot</Text> and follow the prompts to create your storage bot.
              </Text>
            </View>

            <View style={styles.step}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepText}>
                Copy the HTTP API <Text style={styles.bold}>Bot Token</Text> and paste it above.
              </Text>
            </View>

            <View style={styles.step}>
              <Text style={styles.stepNum}>4</Text>
              <Text style={styles.stepText}>
                Create a new <Text style={styles.bold}>Private Channel</Text> inside Telegram.
              </Text>
            </View>

            <View style={styles.step}>
              <Text style={styles.stepNum}>5</Text>
              <Text style={styles.stepText}>
                Add your bot as an <Text style={styles.bold}>Administrator</Text> in the channel.
              </Text>
            </View>

            <View style={styles.step}>
              <Text style={styles.stepNum}>6</Text>
              <Text style={styles.stepText}>
                Get your channel's ID (typically starts with -100). You can forward a message from the channel to a bot like <Text style={styles.bold}>@JsonDumpBot</Text> or <Text style={styles.bold}>@ShowJsonBot</Text> to find it. Paste it above.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  halfButton: {
    width: '48%',
    marginVertical: 0,
  },
  instructionsCard: {
    backgroundColor: '#121212',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  instructionsTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  step: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  stepText: {
    color: '#8E8E93',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  bold: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default TelegramConnectScreen;
