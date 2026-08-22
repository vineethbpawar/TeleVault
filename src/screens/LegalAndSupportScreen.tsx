import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import { Shield, FileText, Mail, ChevronLeft, Lock, Globe, Phone, ExternalLink } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import TeleVaultLogo from '../components/TeleVaultLogo';

type Props = NativeStackScreenProps<AppStackParamList, 'LegalAndSupport'>;

export const LegalAndSupportScreen: React.FC<Props> = ({ navigation, route }) => {
  const initialTab = route.params?.initialTab || 'privacy';
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'support'>(initialTab);

  const handleEmailSupport = () => {
    Linking.openURL('mailto:televault.biz@gmail.com?subject=TeleVault%20Support%20Request');
  };

  const handleWebVisit = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(window.location.origin, '_blank');
    } else {
      Linking.openURL('https://televault.app');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'privacy' && styles.tabItemActive]}
          onPress={() => setActiveTab('privacy')}
        >
          <Shield size={16} color={activeTab === 'privacy' ? '#FFFC00' : '#8E8E93'} />
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
            Privacy
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'terms' && styles.tabItemActive]}
          onPress={() => setActiveTab('terms')}
        >
          <FileText size={16} color={activeTab === 'terms' ? '#FFFC00' : '#8E8E93'} />
          <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
            Terms
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'support' && styles.tabItemActive]}
          onPress={() => setActiveTab('support')}
        >
          <Mail size={16} color={activeTab === 'support' ? '#FFFC00' : '#8E8E93'} />
          <Text style={[styles.tabText, activeTab === 'support' && styles.tabTextActive]}>
            Support
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'privacy' && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <Shield size={36} color="#FFFC00" />
              <Text style={styles.cardTitle}>Privacy Policy</Text>
              <Text style={styles.cardSubtitle}>Last updated: August 5, 2026</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionHeading}>1. Overview</Text>
            <Text style={styles.paragraph}>
              TeleVault ("we", "our", or "us") respects your privacy and is committed to protecting your personal data. TeleVault provides end-to-end encrypted storage and secure messaging powered by Telegram Cloud API and Supabase authentication.
            </Text>

            <Text style={styles.sectionHeading}>2. Data We Collect</Text>
            <Text style={styles.paragraph}>
              - <Text style={styles.bold}>Account Credentials:</Text> Email address, display name, and username for authentication.
            </Text>
            <Text style={styles.paragraph}>
              - <Text style={styles.bold}>Media & Content:</Text> Photos, videos, and files uploaded to your TeleVault. Files are encrypted client-side and stored in your private Telegram cloud channel.
            </Text>
            <Text style={styles.paragraph}>
              - <Text style={styles.bold}>Device & Analytics:</Text> Device model, operating system version, and anonymized diagnostic logs to maintain app stability.
            </Text>

            <Text style={styles.sectionHeading}>3. How We Use Data</Text>
            <Text style={styles.paragraph}>
              We use your data solely to provide, operate, and maintain TeleVault's services. We do NOT sell, rent, or trade your personal data or uploaded media to any third party or advertising broker.
            </Text>

            <Text style={styles.sectionHeading}>4. Data Storage & Encryption</Text>
            <Text style={styles.paragraph}>
              All user uploaded media files are processed locally on your device and transmitted securely via encrypted Telegram Bot API channels. File metadata is indexed securely via Supabase PostgreSQL.
            </Text>

            <Text style={styles.sectionHeading}>5. Your Rights & Data Deletion</Text>
            <Text style={styles.paragraph}>
              You have the right to request deletion of all your account data at any time directly through the "Delete All Data (Danger Zone)" option in TeleVault Settings or by contacting support@televault.app.
            </Text>
          </View>
        )}

        {activeTab === 'terms' && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <FileText size={36} color="#FFFC00" />
              <Text style={styles.cardTitle}>Terms of Service</Text>
              <Text style={styles.cardSubtitle}>Effective Date: August 5, 2026</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionHeading}>1. Acceptance of Terms</Text>
            <Text style={styles.paragraph}>
              By downloading, installing, or using TeleVault, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the application.
            </Text>

            <Text style={styles.sectionHeading}>2. Acceptable Use Policy</Text>
            <Text style={styles.paragraph}>
              You agree not to use TeleVault for any unlawful purpose or to store, share, or transmit illegal, abusive, infringing, or harmful content. TeleVault reserves the right to suspend or terminate accounts violating these standards.
            </Text>

            <Text style={styles.sectionHeading}>3. Account Responsibility</Text>
            <Text style={styles.paragraph}>
              You are responsible for maintaining the confidentiality of your account credentials, security PIN, and private Telegram Bot Tokens. TeleVault is not liable for unauthorized access resulting from compromised user credentials.
            </Text>

            <Text style={styles.sectionHeading}>4. Storage & Service Availability</Text>
            <Text style={styles.paragraph}>
              TeleVault uses third-party APIs (including Telegram and Supabase) to deliver storage services. While we aim for maximum availability, service uptime is dependent on these underlying infrastructure providers.
            </Text>

            <Text style={styles.sectionHeading}>5. Limitation of Liability</Text>
            <Text style={styles.paragraph}>
              TeleVault and its developers shall not be liable for any indirect, incidental, or consequential damages resulting from lost files, network outages, or unauthorized device access.
            </Text>

            <Text style={styles.sectionHeading}>6. Updates to Terms</Text>
            <Text style={styles.paragraph}>
              We reserve the right to modify these Terms of Service at any time. Continued use of the app constitutes acceptance of modified terms.
            </Text>
          </View>
        )}

        {activeTab === 'support' && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <Mail size={36} color="#FFFC00" />
              <Text style={styles.cardTitle}>Contact & Support</Text>
              <Text style={styles.cardSubtitle}>We're here to help you</Text>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.supportOption} onPress={handleEmailSupport}>
              <View style={styles.supportOptionLeft}>
                <View style={styles.supportIconCircle}>
                  <Mail size={20} color="#FFFC00" />
                </View>
                <View style={styles.supportOptionMeta}>
                  <Text style={styles.supportOptionTitle}>Email Support</Text>
                  <Text style={styles.supportOptionSub}>televault.biz@gmail.com</Text>
                </View>
              </View>
              <ExternalLink size={18} color="#8E8E93" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.supportOption} onPress={handleWebVisit}>
              <View style={styles.supportOptionLeft}>
                <View style={styles.supportIconCircle}>
                  <Globe size={20} color="#64D2FF" />
                </View>
                <View style={styles.supportOptionMeta}>
                  <Text style={styles.supportOptionTitle}>Official Website</Text>
                  <Text style={styles.supportOptionSub}>https://televault.app</Text>
                </View>
              </View>
              <ExternalLink size={18} color="#8E8E93" />
            </TouchableOpacity>

            <View style={styles.devCard}>
              <TeleVaultLogo size={44} />
              <Text style={styles.devName}>Vineeth</Text>
              <Text style={styles.devRole}>Lead Developer & Creator</Text>
              <Text style={styles.devBio}>
                TeleVault is built with passion to deliver secure, user-owned cloud storage. For inquiries, bug reports, or feature requests, feel free to reach out directly via email.
              </Text>
              <AppButton
                title="Send Support Email"
                onPress={handleEmailSupport}
                style={{ marginTop: 16, width: '100%' }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F1221',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: '#1C2035',
  },
  tabText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFC00',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#0F1221',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  iconHeader: {
    alignItems: 'center',
    marginVertical: 8,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 10,
  },
  cardSubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginVertical: 16,
  },
  sectionHeading: {
    color: '#FFFC00',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    color: '#D1D1D6',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  supportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16192E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262942',
  },
  supportOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  supportIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 252, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  supportOptionMeta: {
    justifyContent: 'center',
  },
  supportOptionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  supportOptionSub: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  devCard: {
    backgroundColor: '#16192E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#262942',
  },
  devName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  devRole: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  devBio: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 10,
  },
});

export default LegalAndSupportScreen;
