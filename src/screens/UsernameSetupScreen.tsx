import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import AppInput from '../components/AppInput';
import AppButton from '../components/AppButton';
import { User } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { authEvents } from '../utils/authEvent';

type Props = NativeStackScreenProps<AppStackParamList, 'UsernameSetup'>;

export const UsernameSetupScreen: React.FC<Props> = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSetup = async () => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanFullName = fullName.trim();

    if (!cleanUsername) {
      setError('Username is required.');
      return;
    }

    // Username rules validation
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      setError('Username must be between 3 and 20 characters.');
      return;
    }

    const usernameRegex = /^[a-z0-9_]+$/;
    if (!usernameRegex.test(cleanUsername)) {
      setError('Username can only contain lowercase letters, numbers, and underscores.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user session found.');

      // 1. Check availability
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (checkError) {
        console.error('Check Username Error:', checkError);
      }

      if (existingUser && existingUser.id !== user.id) {
        setError('This username is already taken. Please try another one.');
        setLoading(false);
        return;
      }

      // 2. Save username and full name using upsert for safety
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          username: cleanUsername,
          full_name: cleanFullName || null,
          updated_at: new Date().toISOString(),
        });

      if (updateError) {
        if (updateError.code === '23505') {
          setError('This username is already taken. Please try another one.');
        } else {
          setError(updateError.message || 'Failed to save profile details.');
        }
        setLoading(false);
        return;
      }

      Alert.alert('Success', 'Profile setup complete!', [
        {
          text: 'Get Started',
          onPress: () => {
            // Emit auth event to trigger navigation switch after user acknowledges
            authEvents.emit();
          },
        },
      ]);
    } catch (e: any) {
      setError(e.message || 'An error occurred during profile setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <User size={36} color="#FFFC00" />
            </View>
            <Text style={styles.title}>Complete Profile</Text>
            <Text style={styles.subtitle}>Choose your username to start sending snaps and chatting</Text>
          </View>

          <View style={styles.formContainer}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <AppInput
              label="Full Name (Optional)"
              placeholder="e.g. Vineeth Pawar"
              value={fullName}
              onChangeText={setFullName}
            />

            <AppInput
              label="Username"
              placeholder="e.g. vineeth_p"
              autoCapitalize="none"
              value={username}
              onChangeText={(text) => setUsername(text.toLowerCase())}
            />

            <Text style={styles.tipText}>
              Username must be 3-20 characters, lowercase only, containing only letters, numbers, and underscores.
            </Text>

            <AppButton
              title="Save & Continue"
              onPress={handleSetup}
              loading={loading}
              style={styles.button}
            />
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  formContainer: {
    width: '100%',
    marginBottom: 24,
  },
  button: {
    marginTop: 24,
  },
  errorText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
    textAlign: 'center',
  },
  tipText: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 16,
    marginTop: -4,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
});

export default UsernameSetupScreen;
