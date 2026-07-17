import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { friendService } from '../services/friendService';
import AppHeader from '../components/AppHeader';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';

type Props = NativeStackScreenProps<AppStackParamList, 'ReportUser'>;

const REASONS = [
  'Spam or Scams',
  'Harassment or Abuse',
  'Inappropriate media / NSFW',
  'Hate Speech',
  'Impersonation',
  'Other',
];

export const ReportUserScreen: React.FC<Props> = ({ navigation, route }) => {
  const { reportedUserId, reportedUsername } = route.params;
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Selection Required', 'Please select a reason for reporting.');
      return;
    }

    setLoading(true);
    try {
      await friendService.reportUser(reportedUserId, selectedReason, details);
      Alert.alert(
        'Report Submitted',
        `Thank you. Your report regarding @${reportedUsername} has been submitted for admin review.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Submission Error', err.message || 'Failed to submit report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.container}>
      <AppHeader title={`Report @${reportedUsername}`} showBackButton={true} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.instructions}>
          Select a reason why you are reporting this user. Admin will review the report and take appropriate actions.
        </Text>

        <Text style={styles.sectionHeader}>SELECT A REASON</Text>
        {REASONS.map((reason) => (
          <TouchableOpacity
            key={reason}
            style={[
              styles.reasonRow,
              selectedReason === reason && styles.selectedReasonRow,
            ]}
            onPress={() => setSelectedReason(reason)}
          >
            <Text
              style={[
                styles.reasonText,
                selectedReason === reason && styles.selectedReasonText,
              ]}
            >
              {reason}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionHeader}>ADDITIONAL DETAILS (OPTIONAL)</Text>
        <TextInput
          style={styles.detailsInput}
          placeholder="Please add any relevant context or details..."
          placeholderTextColor="#8e92af"
          value={details}
          onChangeText={setDetails}
          multiline
          numberOfLines={4}
        />

        <AppButton
          title="Submit Report"
          onPress={handleSubmit}
          variant="danger"
          loading={loading}
          style={styles.submitBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    padding: 16,
  },
  instructions: {
    color: '#8e92af',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  reasonRow: {
    backgroundColor: '#0f1123',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  selectedReasonRow: {
    borderColor: '#FFFC00',
    backgroundColor: '#1b1d35',
  },
  reasonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedReasonText: {
    color: '#FFFC00',
  },
  detailsInput: {
    backgroundColor: '#0f1123',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1f2444',
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  submitBtn: {
    marginTop: 10,
  },
});

export default ReportUserScreen;
