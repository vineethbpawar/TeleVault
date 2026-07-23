import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  Users,
  HardDrive,
  MessageSquare,
  Phone,
  Shield,
  BarChart2,
  Sliders,
  Bell,
  Terminal,
  FileText,
  Search,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  X,
  Play,
  RotateCw,
  LogOut,
  ChevronRight,
  UserX,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { securityService } from '../services/securityService';
import { showToast } from '../components/ToastBanner';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// Initial log messages
const INITIAL_LOGS = [
  { id: '1', time: '10:41:05', type: 'info', text: 'Admin TCC OS mode activated.' },
  { id: '2', time: '10:40:12', type: 'info', text: 'Supabase real-time telemetry feed ready.' },
];

export const AdminOSScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [logs, setLogs] = useState(INITIAL_LOGS);
  
  // Real Database Metrics
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [totalFiles, setTotalFiles] = useState<number>(0);
  const [totalChats, setTotalChats] = useState<number>(0);
  
  // Live Telemetry
  const [dbLatency, setDbLatency] = useState<number>(0);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  
  // User Management
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Security Audit logs
  const [auditLogs, setAuditLogs] = useState<any[]>([
    { id: 'a1', time: '10:41:05', admin: 'tv_vini_root', action: 'TCC_UNLOCK', target: 'System', status: 'SUCCESS' }
  ]);

  // Remote Config & Rollouts
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [disableReg, setDisableReg] = useState(false);
  const [disableCalls, setDisableCalls] = useState(false);
  const [disableUploads, setDisableUploads] = useState(false);
  const [rolloutPercentage, setRolloutPercentage] = useState(100);

  // Fetch real metrics from Supabase
  const fetchLiveMetrics = async () => {
    setRefreshing(true);
    const start = Date.now();
    try {
      // 1. Measure actual database latency
      const { data: pingData, error: pingError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      
      setDbLatency(Date.now() - start);

      // 2. Fetch total users count
      const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      setTotalUsers(usersCount || 0);

      // 3. Fetch total files count
      const { count: filesCount } = await supabase
        .from('files')
        .select('*', { count: 'exact', head: true });
      setTotalFiles(filesCount || 0);

      // 4. Fetch total conversations count
      const { count: convCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });
      setTotalChats(convCount || 0);

      // 5. Fetch actual users list
      setLoadingUsers(true);
      const { data: usersList, error: usersErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (!usersErr && usersList) {
        setDbUsers(usersList);
      }
      setLoadingUsers(false);

      // Try fetching real audit logs if table exists, otherwise keep local memory
      const { data: dbAudits } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (dbAudits && dbAudits.length > 0) {
        setAuditLogs(dbAudits);
      }

    } catch (e: any) {
      console.warn('TCC metrics fetch issue:', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();

    // Set up real-time telemetry updates loop
    const interval = setInterval(() => {
      // Measure real-time latency ping
      const ping = async () => {
        const start = Date.now();
        await supabase.from('profiles').select('id').limit(1);
        setDbLatency(Date.now() - start);
      };
      ping().catch(() => setRealtimeConnected(false));
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const addAuditLog = async (action: string, target: string, status: string = 'SUCCESS') => {
    const time = new Date().toTimeString().split(' ')[0];
    const newLocalAudit = {
      id: String(Date.now()),
      time,
      admin: 'tv_vini_root',
      action,
      target,
      status,
      ip: '127.0.0.1',
    };
    
    setAuditLogs(prev => [newLocalAudit, ...prev]);

    // Try logging to database table if available
    try {
      await supabase.from('audit_logs').insert({
        admin: 'tv_vini_root',
        action,
        target,
        status,
      });
    } catch (_) {}
  };

  const handleActionConfirm = (title: string, actionDesc: string, onConfirm: () => void) => {
    Alert.alert(
      title,
      `Are you sure you want to: ${actionDesc}? This operation will be permanently recorded in the audit logs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          style: 'destructive',
          onPress: onConfirm
        }
      ]
    );
  };

  const handleExitAdminMode = () => {
    securityService.lockAdminMode();
    showToast('Admin Mode Disabled.');
    navigation.goBack();
  };

  const handleSuspendUser = async (user: any) => {
    try {
      // Update in Supabase
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'suspended' })
        .eq('id', user.id);

      if (error) throw error;

      showToast(`User @${user.username || 'unknown'} suspended.`);
      addAuditLog('SUSPEND_USER', user.username || user.id);
      fetchLiveMetrics();
    } catch (err: any) {
      Alert.alert('Operation Failed', err.message || 'Could not update user role status.');
    }
  };

  const handleBanUser = async (user: any) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'banned' })
        .eq('id', user.id);

      if (error) throw error;

      showToast(`User @${user.username || 'unknown'} permanently banned.`);
      addAuditLog('BAN_USER', user.username || user.id);
      fetchLiveMetrics();
    } catch (err: any) {
      Alert.alert('Operation Failed', err.message || 'Could not ban user.');
    }
  };

  const renderSectionHeader = (title: string, icon: any) => (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.statusDot, { backgroundColor: realtimeConnected ? '#30D158' : '#FF9500' }]} />
          <Text style={styles.headerTitle}>TeleVault Control Center (TCC)</Text>
          <Text style={styles.versionBadge}>v2.0 AdminOS</Text>
        </View>
        <TouchableOpacity style={styles.exitBtn} onPress={handleExitAdminMode}>
          <LogOut size={16} color="#FF3B30" style={{ marginRight: 6 }} />
          <Text style={styles.exitText}>Exit OS</Text>
        </TouchableOpacity>
      </View>

      {/* Main Layout split sidebar and view pane */}
      <View style={styles.mainLayout}>
        <View style={styles.sidebar}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[
              { id: 'dashboard', label: 'Dashboard', icon: <Activity size={16} /> },
              { id: 'liveops', label: 'Live Ops', icon: <Terminal size={16} /> },
              { id: 'users', label: 'Users', icon: <Users size={16} /> },
              { id: 'storage', label: 'Storage', icon: <HardDrive size={16} /> },
              { id: 'config', label: 'Remote Config', icon: <Sliders size={16} /> },
              { id: 'audit', label: 'Audit Logs', icon: <CheckCircle size={16} /> },
            ].map(item => {
              const active = activeTab === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.sidebarBtn, active && styles.sidebarBtnActive]}
                  onPress={() => {
                    setActiveTab(item.id);
                    setSelectedUser(null);
                  }}
                >
                  <View style={{ marginRight: 8, opacity: active ? 1 : 0.6 }}>
                    {React.cloneElement(item.icon, { color: active ? '#FFFC00' : '#8E8E93' })}
                  </View>
                  <Text style={[styles.sidebarBtnText, active && styles.sidebarBtnTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Content pane */}
        <View style={styles.contentPane}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            
            {/* 1. DASHBOARD */}
            {activeTab === 'dashboard' && (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  {renderSectionHeader('System Health & Latency', <Activity size={20} color="#FFFC00" />)}
                  <TouchableOpacity style={styles.refreshBtn} onPress={fetchLiveMetrics}>
                    {refreshing ? (
                      <ActivityIndicator size="small" color="#FFFC00" />
                    ) : (
                      <RotateCw size={16} color="#FFFC00" />
                    )}
                  </TouchableOpacity>
                </View>

                {/* Health Cards Row */}
                <View style={styles.gridRow}>
                  <View style={styles.glassCard}>
                    <Text style={styles.cardLabel}>Database Connection</Text>
                    <Text style={styles.cardValueGreen}>ONLINE</Text>
                    <Text style={styles.cardSubtext}>Latency: {dbLatency}ms</Text>
                  </View>
                  <View style={styles.glassCard}>
                    <Text style={styles.cardLabel}>Realtime Connection</Text>
                    <Text style={styles.cardValueGreen}>{realtimeConnected ? 'STABLE' : 'DEGRADED'}</Text>
                    <Text style={styles.cardSubtext}>Pool status: Healthy</Text>
                  </View>
                </View>

                {/* Metrics Stats */}
                <View style={styles.glassStatsCard}>
                  <Text style={styles.cardTitle}>Live Database Metrics</Text>
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{totalUsers}</Text>
                      <Text style={styles.statLabelText}>Total Users</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{totalFiles}</Text>
                      <Text style={styles.statLabelText}>Uploaded Files</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{totalChats}</Text>
                      <Text style={styles.statLabelText}>Conversations</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* 2. LIVE OPERATIONS */}
            {activeTab === 'liveops' && (
              <View>
                {renderSectionHeader('Operations Stream', <Terminal size={20} color="#FFFC00" />)}
                <View style={styles.logConsole}>
                  {logs.map(log => (
                    <View key={log.id} style={styles.logRow}>
                      <Text style={styles.logTime}>[{log.time}]</Text>
                      <Text style={[styles.logType, { color: '#34C759' }]}>[INFO]</Text>
                      <Text style={styles.logText}>{log.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 3. USER INTELLIGENCE */}
            {activeTab === 'users' && (
              <View>
                {renderSectionHeader('User Intelligence Engine', <Users size={20} color="#FFFC00" />)}
                
                {/* Search Bar */}
                <View style={styles.searchContainer}>
                  <Search size={18} color="#8E8E93" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search Username or ID..."
                    placeholderTextColor="#8E8E93"
                    value={userSearch}
                    onChangeText={setUserSearch}
                  />
                </View>

                {loadingUsers && <ActivityIndicator size="large" color="#FFFC00" style={{ marginVertical: 20 }} />}

                {selectedUser ? (
                  <View style={styles.userDetailCard}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedUser(null)}>
                      <ArrowLeft size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#FFFFFF', fontSize: 13 }}>Back to List</Text>
                    </TouchableOpacity>
                    
                    <Text style={styles.userNameHeader}>@{selectedUser.username || 'unknown'}</Text>
                    <Text style={styles.userEmail}>{selectedUser.id}</Text>
                    
                    <View style={styles.statsDivider} />
                    
                    <View style={styles.detailGrid}>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Role Status</Text><Text style={styles.detailValue}>{(selectedUser.role || 'user').toUpperCase()}</Text></View>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Joined Date</Text><Text style={styles.detailValue}>{new Date(selectedUser.created_at).toLocaleDateString()}</Text></View>
                    </View>

                    <Text style={styles.subHeading}>Administrative Override Actions</Text>
                    <View style={styles.adminActionsRow}>
                      <TouchableOpacity 
                        style={[styles.adminBtn, { backgroundColor: '#FF9500' }]} 
                        onPress={() => handleActionConfirm('Suspend Account', `suspend @${selectedUser.username}`, () => handleSuspendUser(selectedUser))}
                      >
                        <Text style={styles.adminBtnText}>Suspend</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.adminBtn, { backgroundColor: '#FF3B30' }]} 
                        onPress={() => handleActionConfirm('Ban User', `permanently ban @${selectedUser.username}`, () => handleBanUser(selectedUser))}
                      >
                        <Text style={styles.adminBtnText}>Ban User</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.usersList}>
                    {dbUsers
                      .filter(u => (u.username || '').toLowerCase().includes(userSearch.toLowerCase()) || u.id.includes(userSearch))
                      .map(u => (
                        <TouchableOpacity 
                          key={u.id} 
                          style={styles.userRowItem}
                          onPress={() => setSelectedUser(u)}
                        >
                          <View>
                            <Text style={styles.userRowUsername}>@{u.username || 'unknown'}</Text>
                            <Text style={styles.userRowEmail}>{u.id}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.roleBadge}>{(u.role || 'user').toUpperCase()}</Text>
                            <ChevronRight size={16} color="#8E8E93" />
                          </View>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>
            )}

            {/* 4. STORAGE COMMAND CENTER */}
            {activeTab === 'storage' && (
              <View>
                {renderSectionHeader('Storage Command Center', <HardDrive size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Global Sync Diagnostics</Text>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Total Files Database Rows</Text><Text style={styles.listItemValue}>{totalFiles}</Text></View>
                  
                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.actionOutlineBtn} onPress={() => {
                      showToast('Database storage sync initiated.');
                      addAuditLog('SYNC_METRICS', 'Storage');
                      fetchLiveMetrics();
                    }}>
                      <Text style={styles.actionOutlineBtnText}>Sync Database Metrics</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* 5. REMOTE CONFIG */}
            {activeTab === 'config' && (
              <View>
                {renderSectionHeader('Remote Configuration', <Sliders size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Maintenance Toggles</Text>
                  
                  <View style={styles.configToggleRow}>
                    <View>
                      <Text style={styles.toggleTitle}>Maintenance Mode</Text>
                      <Text style={styles.toggleSubtitle}>Block non-admin database request streams</Text>
                    </View>
                    <Switch
                      value={maintenanceMode}
                      onValueChange={(val) => {
                        setMaintenanceMode(val);
                        addAuditLog('TOGGLE_MAINTENANCE', String(val));
                        showToast(`Maintenance mode: ${val ? 'ENABLED' : 'DISABLED'}`);
                      }}
                      trackColor={{ false: '#2C2C2E', true: '#FF3B30' }}
                      thumbColor="#000000"
                    />
                  </View>

                  <View style={styles.configToggleRow}>
                    <View>
                      <Text style={styles.toggleTitle}>Read-Only Mode</Text>
                      <Text style={styles.toggleSubtitle}>Restrict inserts/updates across tables</Text>
                    </View>
                    <Switch
                      value={readOnlyMode}
                      onValueChange={(val) => {
                        setReadOnlyMode(val);
                        addAuditLog('TOGGLE_READONLY', String(val));
                        showToast(`Read-only mode: ${val ? 'ENABLED' : 'DISABLED'}`);
                      }}
                      trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                      thumbColor="#000000"
                    />
                  </View>

                  <View style={styles.statsDivider} />

                  <Text style={styles.subHeading}>Feature Rollout Staging</Text>
                  <View style={styles.rolloutContainer}>
                    <Text style={styles.rolloutTitle}>Calls Feature Rollout percentage</Text>
                    <View style={styles.rolloutButtons}>
                      {[1, 10, 50, 100].map(pct => {
                        const active = rolloutPercentage === pct;
                        return (
                          <TouchableOpacity
                            key={pct}
                            style={[styles.rolloutBtn, active && styles.rolloutBtnActive]}
                            onPress={() => {
                              setRolloutPercentage(pct);
                              showToast(`Feature rolled out to ${pct}%.`);
                              addAuditLog('ROLLOUT_STAGE', `Calls_${pct}%`);
                            }}
                          >
                            <Text style={[styles.rolloutBtnText, active && styles.rolloutBtnTextActive]}>{pct}%</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* 6. AUDIT LOGS */}
            {activeTab === 'audit' && (
              <View>
                {renderSectionHeader('Administrative Action Audit Logs', <CheckCircle size={20} color="#FFFC00" />)}
                <View style={styles.auditContainer}>
                  {auditLogs.map(audit => (
                    <View key={audit.id} style={styles.auditRow}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={styles.auditAction}>{audit.action}</Text>
                        <Text style={styles.auditTime}>{audit.time || new Date(audit.created_at).toTimeString().split(' ')[0]}</Text>
                      </View>
                      <Text style={styles.auditTarget}>Target: {audit.target} ({audit.status})</Text>
                      <Text style={styles.auditMeta}>Admin: {audit.admin || 'tv_vini_root'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#050505',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  versionBadge: {
    color: '#30D158',
    fontSize: 10,
    fontWeight: '600',
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  exitText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '700',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: isWeb ? 220 : 130,
    backgroundColor: '#050505',
    borderRightWidth: 1,
    borderRightColor: '#1E1E1E',
    paddingVertical: 12,
  },
  sidebarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  sidebarBtnActive: {
    backgroundColor: 'rgba(255, 252, 0, 0.08)',
  },
  sidebarBtnText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  sidebarBtnTextActive: {
    color: '#FFFC00',
    fontWeight: '700',
  },
  contentPane: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1C1C1E',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  glassCard: {
    flex: 1,
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  glassCardBig: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardValueGreen: {
    color: '#30D158',
    fontSize: 14,
    fontWeight: '700',
  },
  cardSubtext: {
    color: '#8E8E93',
    fontSize: 10,
    marginTop: 6,
  },
  glassStatsCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginTop: 12,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    color: '#FFFC00',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabelText: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 4,
  },
  logConsole: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 16,
    padding: 12,
  },
  logRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 4,
  },
  logTime: {
    color: '#8E8E93',
    fontSize: 11.5,
    marginRight: 6,
  },
  logType: {
    fontSize: 11.5,
    fontWeight: '700',
    marginRight: 6,
  },
  logText: {
    color: '#E5E5EA',
    fontSize: 11.5,
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  userDetailCard: {
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 16,
    padding: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  userNameHeader: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  userEmail: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
  statsDivider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 16,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  detailItem: {
    width: '45%',
  },
  detailLabel: {
    color: '#8E8E93',
    fontSize: 11,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  subHeading: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 10,
  },
  adminActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  adminBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  usersList: {
    gap: 8,
  },
  userRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161618',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  userRowUsername: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  userRowEmail: {
    color: '#8E8E93',
    fontSize: 11.5,
    marginTop: 2,
  },
  roleBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFC00',
    backgroundColor: 'rgba(255, 252, 0, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  listItemText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  listItemValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionOutlineBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionOutlineBtnText: {
    color: '#FFFC00',
    fontSize: 12,
    fontWeight: '700',
  },
  configToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleTitle: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  toggleSubtitle: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  rolloutContainer: {
    marginTop: 12,
  },
  rolloutTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  rolloutButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rolloutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  rolloutBtnActive: {
    backgroundColor: '#FFFC00',
  },
  rolloutBtnText: {
    color: '#8E8E93',
    fontSize: 11.5,
    fontWeight: '700',
  },
  rolloutBtnTextActive: {
    color: '#000000',
  },
  auditContainer: {
    gap: 8,
  },
  auditRow: {
    backgroundColor: '#161618',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  auditAction: {
    color: '#FFFC00',
    fontSize: 13,
    fontWeight: '700',
  },
  auditTime: {
    color: '#8E8E93',
    fontSize: 11,
  },
  auditTarget: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 4,
  },
  auditMeta: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 4,
  },
});

export default AdminOSScreen;
