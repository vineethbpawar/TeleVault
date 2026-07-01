import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Shield, Users, AlertTriangle, FileText, Check, Trash2, ArrowLeft } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../types/navigation';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types/chat';
import { UserReport } from '../types/friends';
import AppHeader from '../components/AppHeader';
import AppCard from '../components/AppCard';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminDashboard'>;

interface Stats {
  usersCount: number;
  reportsCount: number;
  filesCount: number;
  groupsCount: number;
}

export const AdminDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats>({ usersCount: 0, reportsCount: 0, filesCount: 0, groupsCount: 0 });
  const [reports, setReports] = useState<UserReport[]>([]);
  const [latestUsers, setLatestUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const checkAdminAndLoad = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Fetch user profile role
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || !profile || profile.role !== 'admin') {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      await loadDashboardData();
    } catch (err) {
      console.error('Check Admin Error:', err);
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      // 1. Fetch counts
      const [usersRes, reportsRes, filesRes, groupsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_reports').select('id', { count: 'exact', head: true }),
        supabase.from('files').select('id', { count: 'exact', head: true }),
        supabase.from('groups').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        usersCount: usersRes.count || 0,
        reportsCount: reportsRes.count || 0,
        filesCount: filesRes.count || 0,
        groupsCount: groupsRes.count || 0,
      });

      // 2. Fetch pending reports
      const { data: reportData, error: reportError } = await supabase
        .from('user_reports')
        .select(`
          *,
          reporter:profiles!user_reports_reporter_id_fkey(*),
          reported:profiles!user_reports_reported_id_fkey(*)
        `)
        .order('created_at', { ascending: false });

      if (reportError) console.error('Fetch Reports Error:', reportError);
      setReports((reportData || []) as any);

      // 3. Fetch latest users
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (userError) console.error('Fetch Users Error:', userError);
      setLatestUsers((userData || []) as UserProfile[]);

    } catch (error) {
      console.error('Load Dashboard Data Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const handleReviewReport = async (reportId: string, status: 'reviewed' | 'dismissed') => {
    try {
      const { error } = await supabase
        .from('user_reports')
        .update({ status })
        .eq('id', reportId);

      if (error) throw error;
      Alert.alert('Report Updated', `Report has been marked as ${status}.`);
      loadDashboardData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update report.');
    }
  };

  const handleDisableContent = (reportedUserId: string) => {
    Alert.alert(
      'Purge User Content',
      `Are you sure you want to delete ALL metadata files uploaded by this user? Actual files on Telegram won't be deleted but their access in TeleVault will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Metadata',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('files')
                .delete()
                .eq('user_id', reportedUserId);

              if (error) throw error;
              Alert.alert('Purged', 'All file metadata entries for this user have been deleted.');
              loadDashboardData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete user content.');
            }
          },
        },
      ]
    );
  };

  if (isAdmin === false) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader title="Admin Panel" showBackButton={true} />
        <View style={styles.center}>
          <Shield size={64} color="#FF453A" style={{ marginBottom: 16 }} />
          <Text style={styles.accessDeniedTitle}>Access Denied</Text>
          <Text style={styles.accessDeniedSub}>Only users with 'admin' privileges can access this dashboard.</Text>
          <AppButton title="Go Back" onPress={() => navigation.goBack()} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader title="Admin Dashboard" showBackButton={true} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader title="Admin Controls" showBackButton={true} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={checkAdminAndLoad} tintColor="#FFFC00" />}
      >
        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>APP METRICS</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Users size={22} color="#FFFC00" />
            <Text style={styles.statNum}>{stats.usersCount}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>

          <View style={styles.statBox}>
            <AlertTriangle size={22} color="#FF453A" />
            <Text style={styles.statNum}>{stats.reportsCount}</Text>
            <Text style={styles.statLabel}>Reports Filed</Text>
          </View>

          <View style={styles.statBox}>
            <FileText size={22} color="#29B6F6" />
            <Text style={styles.statNum}>{stats.filesCount}</Text>
            <Text style={styles.statLabel}>Sync Files</Text>
          </View>

          <View style={styles.statBox}>
            <Shield size={22} color="#AB47BC" />
            <Text style={styles.statNum}>{stats.groupsCount}</Text>
            <Text style={styles.statLabel}>Groups</Text>
          </View>
        </View>

        {/* Safety Reports */}
        <Text style={styles.sectionTitle}>SAFETY REPORTS ({reports.length})</Text>
        {reports.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No reports filed.</Text>
          </View>
        ) : (
          reports.map((report) => (
            <AppCard key={report.id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={styles.reportStatusBadge}>
                  <Text style={styles.reportStatusText}>{report.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.reportTime}>{new Date(report.created_at).toLocaleDateString()}</Text>
              </View>

              <Text style={styles.reportDetail}>
                <Text style={{ fontWeight: '700', color: '#FFFC00' }}>Reporter: </Text>
                @{report.reporter_profile?.username || 'unknown'}
              </Text>

              <Text style={styles.reportDetail}>
                <Text style={{ fontWeight: '700', color: '#FF453A' }}>Reported: </Text>
                @{report.reported_profile?.username || 'unknown'}
              </Text>

              <Text style={styles.reportDetail}>
                <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>Reason: </Text>
                {report.reason}
              </Text>

              {report.details ? (
                <Text style={styles.reportDesc}>"{report.details}"</Text>
              ) : null}

              {report.status === 'pending' && (
                <View style={styles.reportActions}>
                  <TouchableOpacity
                    style={[styles.btnAction, styles.btnAccept]}
                    onPress={() => handleReviewReport(report.id, 'reviewed')}
                  >
                    <Check size={16} color="#000000" />
                    <Text style={styles.btnActionText}>Review</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnAction, styles.btnPurge]}
                    onPress={() => handleDisableContent(report.reported_id)}
                  >
                    <Trash2 size={16} color="#FFFFFF" />
                    <Text style={[styles.btnActionText, { color: '#FFFFFF' }]}>Purge Files</Text>
                  </TouchableOpacity>
                </View>
              )}
            </AppCard>
          ))
        )}

        {/* Latest Users */}
        <Text style={styles.sectionTitle}>LATEST USERS</Text>
        <AppCard style={styles.usersCard}>
          {latestUsers.map((user, idx) => (
            <View key={user.id} style={[styles.userRow, idx === latestUsers.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {(user.full_name || user.username || '?').substring(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userFullName}>{user.full_name || 'No Name'}</Text>
                <Text style={styles.userUsername}>@{user.username || 'unknown'} ({user.role})</Text>
              </View>
              <Text style={styles.userJoined}>{new Date(user.created_at || '').toLocaleDateString()}</Text>
            </View>
          ))}
        </AppCard>
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
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  accessDeniedTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
  },
  accessDeniedSub: {
    color: '#8e92af',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  sectionTitle: {
    color: '#8e92af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statBox: {
    width: '48%',
    backgroundColor: '#0f1123',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  statNum: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginVertical: 4,
  },
  statLabel: {
    color: '#8e92af',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: '#0f1123',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2444',
  },
  emptyText: {
    color: '#8e92af',
    fontSize: 14,
  },
  reportCard: {
    marginBottom: 12,
    padding: 14,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reportStatusBadge: {
    backgroundColor: '#2c2c35',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  reportStatusText: {
    color: '#FFFC00',
    fontSize: 10,
    fontWeight: '700',
  },
  reportTime: {
    color: '#8e92af',
    fontSize: 12,
  },
  reportDetail: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 4,
  },
  reportDesc: {
    color: '#8e92af',
    fontSize: 13,
    fontStyle: 'italic',
    backgroundColor: '#151728',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  btnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginLeft: 8,
  },
  btnAccept: {
    backgroundColor: '#FFFC00',
  },
  btnPurge: {
    backgroundColor: '#FF453A',
  },
  btnActionText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  usersCard: {
    paddingVertical: 6,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2444',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f2444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  userAvatarText: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userFullName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  userUsername: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 1,
  },
  userJoined: {
    color: '#8e92af',
    fontSize: 12,
  },
});

export default AdminDashboardScreen;
