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
import { securityService } from '../services/securityService';
import { showToast } from '../components/ToastBanner';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// Mock dataset for live operation logs
const INITIAL_LOGS = [
  { id: '1', time: '10:41:05', type: 'info', text: 'Admin tv_vini_root authenticated successfully.' },
  { id: '2', time: '10:40:12', type: 'warning', text: 'Telegram API latency spiked to 240ms.' },
  { id: '3', time: '10:39:50', type: 'info', text: 'Backup verification completed: 42 files validated.' },
  { id: '4', time: '10:38:11', type: 'error', text: 'Voice note upload failed for conversation_id=314' },
  { id: '5', time: '10:37:05', type: 'info', text: 'User @sandy_bhoom joined TeleVault.' },
  { id: '6', time: '10:35:00', type: 'info', text: 'Group "Finance Vault" created (3 participants).' },
  { id: '7', time: '10:32:44', type: 'security', text: 'Failed login attempt from IP 198.162.1.92' },
];

const MOCK_USERS = [
  { id: 'u1', username: 'vineethbpawar', email: 'vineeth@televault.app', role: 'super_admin', status: 'Active', snaps: 142, files: 89, calls: 47, storage: '1.2 GB', risk: 'Low', joined: '2026-01-10', ip: '103.88.22.14', device: 'iPhone 15 Pro' },
  { id: 'u2', username: 'sandy_bhoom', email: 'sandy@televault.app', role: 'user', status: 'Active', snaps: 24, files: 5, calls: 2, storage: '84 MB', risk: 'Low', joined: '2026-07-23', ip: '103.88.22.45', device: 'Pixel 8 Pro' },
  { id: 'u3', username: 'john_doe', email: 'john@fake.com', role: 'user', status: 'Muted', snaps: 198, files: 212, calls: 14, storage: '8.4 GB', risk: 'Medium', joined: '2026-04-12', ip: '172.56.9.110', device: 'Samsung S24 Ultra' },
  { id: 'u4', username: 'spambot99', email: 'spam@bot.com', role: 'user', status: 'Suspended', snaps: 5, files: 400, calls: 0, storage: '22 GB', risk: 'High', joined: '2026-07-20', ip: '185.220.101.5', device: 'Emulator-x86' },
];

interface Props {
  navigation: any;
}

export const AdminOSScreen: React.FC<Props> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [users, setUsers] = useState(MOCK_USERS);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // Analytics State
  const [apiLatency, setApiLatency] = useState(42);
  const [onlineUsers, setOnlineUsers] = useState(14);
  const [telegramLatency, setTelegramLatency] = useState(115);
  
  // Remote Config states
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [disableReg, setDisableReg] = useState(false);
  const [disableCalls, setDisableCalls] = useState(false);
  const [disableUploads, setDisableUploads] = useState(false);
  
  // Feature Rollout state
  const [rolloutPercentage, setRolloutPercentage] = useState(10);
  
  // Audit log list
  const [auditLogs, setAuditLogs] = useState([
    { id: 'a1', time: '10:41:05', admin: 'tv_vini_root', action: 'ADMIN_LOGIN', target: 'System', status: 'SUCCESS', ip: '127.0.0.1' },
  ]);

  // Periodic simulated live data updates
  useEffect(() => {
    const timer = setInterval(() => {
      // Simulate changing system latency
      setApiLatency(prev => Math.max(10, Math.min(150, prev + Math.floor(Math.random() * 21) - 10)));
      setTelegramLatency(prev => Math.max(80, Math.min(300, prev + Math.floor(Math.random() * 31) - 15)));
      
      // Randomly append logs to Live Operations
      if (Math.random() > 0.7) {
        const types = ['info', 'warning', 'security', 'error'];
        const msgs = [
          'Background backup synchronization sync completed.',
          'ICE Connection re-established for active call session.',
          'Upload chunk #12 saved to Telegram server cache.',
          'Supabase API database heart-beat check returned green status.',
          'Rate limit warning issued for IP 195.9.112.44',
          'Cleaned up 2 orphaned media records from storage cache.'
        ];
        const newLog = {
          id: String(Date.now()),
          time: new Date().toTimeString().split(' ')[0],
          type: types[Math.floor(Math.random() * types.length)],
          text: msgs[Math.floor(Math.random() * msgs.length)]
        };
        setLogs(prev => [newLog, ...prev.slice(0, 49)]);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const addAuditLog = (action: string, target: string, status: string = 'SUCCESS') => {
    const newAudit = {
      id: String(Date.now()),
      time: new Date().toTimeString().split(' ')[0],
      admin: 'tv_vini_root',
      action,
      target,
      status,
      ip: isWeb ? 'localhost' : '127.0.0.1',
    };
    setAuditLogs(prev => [newAudit, ...prev]);
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
          <View style={styles.greenDot} />
          <Text style={styles.headerTitle}>TeleVault Control Center (TCC)</Text>
          <Text style={styles.versionBadge}>v2.0 AdminOS</Text>
        </View>
        <TouchableOpacity style={styles.exitBtn} onPress={handleExitAdminMode}>
          <LogOut size={16} color="#FF3B30" style={{ marginRight: 6 }} />
          <Text style={styles.exitText}>Exit OS</Text>
        </TouchableOpacity>
      </View>

      {/* Main Container */}
      <View style={styles.mainLayout}>
        {/* Navigation Sidebar (Vertical tabs) */}
        <View style={styles.sidebar}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[
              { id: 'dashboard', label: 'Dashboard', icon: <Activity size={16} /> },
              { id: 'liveops', label: 'Live Ops', icon: <Terminal size={16} /> },
              { id: 'users', label: 'Users', icon: <Users size={16} /> },
              { id: 'storage', label: 'Storage', icon: <HardDrive size={16} /> },
              { id: 'comms', label: 'Comms', icon: <MessageSquare size={16} /> },
              { id: 'calls', label: 'Calls', icon: <Phone size={16} /> },
              { id: 'security', label: 'Security', icon: <Shield size={16} /> },
              { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={16} /> },
              { id: 'config', label: 'Remote Config', icon: <Sliders size={16} /> },
              { id: 'developer', label: 'Dev Center', icon: <FileText size={16} /> },
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

        {/* Content Viewer pane */}
        <View style={styles.contentPane}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            
            {/* 1. DASHBOARD */}
            {activeTab === 'dashboard' && (
              <View>
                {renderSectionHeader('Health & Telemetry', <Activity size={20} color="#FFFC00" />)}
                
                {/* Health Cards Row */}
                <View style={styles.gridRow}>
                  <View style={styles.glassCard}>
                    <Text style={styles.cardLabel}>Supabase DB</Text>
                    <Text style={styles.cardValueGreen}>ONLINE</Text>
                    <Text style={styles.cardSubtext}>Latency: {apiLatency}ms</Text>
                  </View>
                  <View style={styles.glassCard}>
                    <Text style={styles.cardLabel}>Telegram API</Text>
                    <Text style={styles.cardValueGreen}>ONLINE</Text>
                    <Text style={styles.cardSubtext}>Latency: {telegramLatency}ms</Text>
                  </View>
                  <View style={styles.glassCard}>
                    <Text style={styles.cardLabel}>Realtime Socket</Text>
                    <Text style={styles.cardValueGreen}>CONNECTED</Text>
                    <Text style={styles.cardSubtext}>Pool: Healthy</Text>
                  </View>
                </View>

                {/* Metrics Stats */}
                <View style={styles.glassStatsCard}>
                  <Text style={styles.cardTitle}>Global Statistics</Text>
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>3,421</Text>
                      <Text style={styles.statLabelText}>Total Users</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{onlineUsers}</Text>
                      <Text style={styles.statLabelText}>Online Now</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>184 GB</Text>
                      <Text style={styles.statLabelText}>Telegram Storage</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>14</Text>
                      <Text style={styles.statLabelText}>Active Calls</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* 2. LIVE OPERATIONS */}
            {activeTab === 'liveops' && (
              <View>
                {renderSectionHeader('Live Operations Log Stream', <Terminal size={20} color="#FFFC00" />)}
                <View style={styles.logConsole}>
                  {logs.map(log => {
                    let typeColor = '#34C759';
                    if (log.type === 'warning') typeColor = '#FF9500';
                    if (log.type === 'error') typeColor = '#FF3B30';
                    if (log.type === 'security') typeColor = '#AF52DE';
                    
                    return (
                      <View key={log.id} style={styles.logRow}>
                        <Text style={styles.logTime}>[{log.time}]</Text>
                        <Text style={[styles.logType, { color: typeColor }]}>[{log.type.toUpperCase()}]</Text>
                        <Text style={styles.logText}>{log.text}</Text>
                      </View>
                    );
                  })}
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
                    placeholder="Search User ID, Username, Email..."
                    placeholderTextColor="#8E8E93"
                    value={userSearch}
                    onChangeText={setUserSearch}
                  />
                </View>

                {selectedUser ? (
                  <View style={styles.userDetailCard}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedUser(null)}>
                      <ArrowLeft size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#FFFFFF', fontSize: 13 }}>Back to List</Text>
                    </TouchableOpacity>
                    
                    <Text style={styles.userNameHeader}>@{selectedUser.username}</Text>
                    <Text style={styles.userEmail}>{selectedUser.email}</Text>
                    
                    <View style={styles.statsDivider} />
                    
                    <View style={styles.detailGrid}>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Role</Text><Text style={styles.detailValue}>{selectedUser.role.toUpperCase()}</Text></View>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Risk Status</Text><Text style={[styles.detailValue, { color: selectedUser.risk === 'High' ? '#FF3B30' : '#34C759' }]}>{selectedUser.risk}</Text></View>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Joined Date</Text><Text style={styles.detailValue}>{selectedUser.joined}</Text></View>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Last Login IP</Text><Text style={styles.detailValue}>{selectedUser.ip}</Text></View>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Device Type</Text><Text style={styles.detailValue}>{selectedUser.device}</Text></View>
                      <View style={styles.detailItem}><Text style={styles.detailLabel}>Encrypted Vault</Text><Text style={styles.detailValue}>{selectedUser.storage}</Text></View>
                    </View>

                    <Text style={styles.subHeading}>Timeline History</Text>
                    <View style={styles.timelineContainer}>
                      <Text style={styles.timelineRow}>• [2026-07-23] Normal session logged in from {selectedUser.device}</Text>
                      <Text style={styles.timelineRow}>• [2026-07-22] Completed backup sync check (0 warnings)</Text>
                      <Text style={styles.timelineRow}>• [2026-07-20] Account created and authenticated</Text>
                    </View>

                    <Text style={styles.subHeading}>Administrative Override Actions</Text>
                    <View style={styles.adminActionsRow}>
                      <TouchableOpacity 
                        style={[styles.adminBtn, { backgroundColor: '#FF9500' }]} 
                        onPress={() => handleActionConfirm('Suspend Account', `suspend @${selectedUser.username}`, () => {
                          showToast('User Suspended.');
                          addAuditLog('SUSPEND_USER', selectedUser.username);
                        })}
                      >
                        <Text style={styles.adminBtnText}>Suspend</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.adminBtn, { backgroundColor: '#FF3B30' }]} 
                        onPress={() => handleActionConfirm('Ban User', `permanently ban @${selectedUser.username}`, () => {
                          showToast('User Permanently Banned.');
                          addAuditLog('BAN_USER', selectedUser.username);
                        })}
                      >
                        <Text style={styles.adminBtnText}>Ban User</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.adminBtn, { backgroundColor: '#30D158' }]} 
                        onPress={() => handleActionConfirm('Reset Upload Queue', `reset storage queue for @${selectedUser.username}`, () => {
                          showToast('Upload Queue Reset.');
                          addAuditLog('RESET_UPLOAD_QUEUE', selectedUser.username);
                        })}
                      >
                        <Text style={styles.adminBtnText}>Reset Queue</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.usersList}>
                    {users
                      .filter(u => u.username.includes(userSearch.toLowerCase()) || u.email.includes(userSearch.toLowerCase()))
                      .map(u => (
                        <TouchableOpacity 
                          key={u.id} 
                          style={styles.userRowItem}
                          onPress={() => setSelectedUser(u)}
                        >
                          <View>
                            <Text style={styles.userRowUsername}>@{u.username}</Text>
                            <Text style={styles.userRowEmail}>{u.email}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[styles.riskLabel, { color: u.risk === 'High' ? '#FF3B30' : (u.risk === 'Medium' ? '#FF9500' : '#8E8E93') }]}>{u.risk} Risk</Text>
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
                  <Text style={styles.cardTitle}>Storage Overview</Text>
                  <Text style={styles.storageNumber}>184.22 GB</Text>
                  <Text style={styles.storageLabel}>Telegram Media Storage Used</Text>
                  
                  <View style={styles.storageMeter}>
                    <View style={[styles.storageProgress, { width: '45%' }]} />
                  </View>
                  <Text style={styles.storageSubtext}>Using 45% of allocated free channel capacity (Unlimited)</Text>

                  <View style={styles.statsDivider} />

                  <Text style={styles.subHeading}>Storage Optimizer Diagnostics</Text>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Orphaned Media Files</Text><Text style={styles.listItemValue}>0 files</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Broken Database References</Text><Text style={styles.listItemValue}>0 references</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Local Decrypted Cache Files</Text><Text style={styles.listItemValue}>42.5 MB</Text></View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.actionOutlineBtn} onPress={() => {
                      showToast('Orphan scanner initiated.');
                      addAuditLog('SCAN_ORPHANS', 'Storage');
                    }}>
                      <Text style={styles.actionOutlineBtnText}>Clean Orphans</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionOutlineBtn} onPress={() => {
                      showToast('Local cache wiped.');
                      addAuditLog('WIPE_CACHE', 'Storage');
                    }}>
                      <Text style={styles.actionOutlineBtnText}>Wipe Cache</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* 5. COMMUNICATION CENTER */}
            {activeTab === 'comms' && (
              <View>
                {renderSectionHeader('Communication Center', <MessageSquare size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Log Metrics</Text>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Active Private Channels</Text><Text style={styles.listItemValue}>128</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Active Group Channels</Text><Text style={styles.listItemValue}>42</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Shared Snaps Today</Text><Text style={styles.listItemValue}>89 snaps</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Stories Log Cache</Text><Text style={styles.listItemValue}>12 active</Text></View>
                </View>
              </View>
            )}

            {/* 6. CALL OPERATIONS */}
            {activeTab === 'calls' && (
              <View>
                {renderSectionHeader('WebRTC Call Operations', <Phone size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Call Diagnostics</Text>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Active WebRTC Calls</Text><Text style={styles.listItemValue}>2 calls</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Average Network Latency</Text><Text style={styles.listItemValue}>45ms</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>ICE Connection Status</Text><Text style={styles.listItemValue}>STABLE</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Relay usage (TURN Server)</Text><Text style={styles.listItemValue}>18% (STUN Direct: 82%)</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Average Packet Loss</Text><Text style={styles.listItemValue}>0.02%</Text></View>
                </View>
              </View>
            )}

            {/* 7. SECURITY CENTER */}
            {activeTab === 'security' && (
              <View>
                {renderSectionHeader('Security Center Console', <Shield size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Intrusion & Abuse Logs</Text>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Failed Login Attempts Today</Text><Text style={styles.listItemValue}>4 attempts</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Suspicious Activity flags</Text><Text style={styles.listItemValue}>0 flags</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Spam reports unresolved</Text><Text style={styles.listItemValue}>0 reports</Text></View>
                  <View style={styles.listRow}><Text style={styles.listItemText}>Device Fingerprint blocks</Text><Text style={styles.listItemValue}>1 device blocked</Text></View>
                </View>
              </View>
            )}

            {/* 8. ANALYTICS */}
            {activeTab === 'analytics' && (
              <View>
                {renderSectionHeader('System Growth Analytics', <BarChart2 size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Usage Stats</Text>
                  <Text style={styles.storageSubtext}>Daily active usage growth is updating dynamically.</Text>
                  
                  {/* Simulated Chart Bars */}
                  <View style={styles.chartContainer}>
                    <View style={[styles.chartBar, { height: 80 }]}><Text style={styles.barText}>Mon</Text></View>
                    <View style={[styles.chartBar, { height: 100 }]}><Text style={styles.barText}>Tue</Text></View>
                    <View style={[styles.chartBar, { height: 130 }]}><Text style={styles.barText}>Wed</Text></View>
                    <View style={[styles.chartBar, { height: 150 }]}><Text style={styles.barText}>Thu</Text></View>
                    <View style={[styles.chartBar, { height: 170, backgroundColor: '#FFFC00' }]}><Text style={styles.barText}>Fri</Text></View>
                  </View>
                </View>
              </View>
            )}

            {/* 9. REMOTE CONFIG */}
            {activeTab === 'config' && (
              <View>
                {renderSectionHeader('Remote App Settings & Config', <Sliders size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Global Toggles</Text>
                  
                  <View style={styles.configToggleRow}>
                    <View>
                      <Text style={styles.toggleTitle}>Emergency Maintenance Mode</Text>
                      <Text style={styles.toggleSubtitle}>Block all regular users from database requests</Text>
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
                      <Text style={styles.toggleSubtitle}>Prevent new file uploads or messaging logs</Text>
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

                  <View style={styles.configToggleRow}>
                    <View>
                      <Text style={styles.toggleTitle}>Block Account Registrations</Text>
                      <Text style={styles.toggleSubtitle}>Prevent new signup requests on landing screens</Text>
                    </View>
                    <Switch
                      value={disableReg}
                      onValueChange={(val) => {
                        setDisableReg(val);
                        addAuditLog('TOGGLE_DISABLE_SIGNUP', String(val));
                        showToast(`Signups: ${val ? 'BLOCKED' : 'ALLOWED'}`);
                      }}
                      trackColor={{ false: '#2C2C2E', true: '#FFFC00' }}
                      thumbColor="#000000"
                    />
                  </View>

                  <View style={styles.statsDivider} />

                  <Text style={styles.subHeading}>Feature Rollout Staging</Text>
                  <View style={styles.rolloutContainer}>
                    <Text style={styles.rolloutTitle}>Voice & Video Calls Rollout Status</Text>
                    <View style={styles.rolloutButtons}>
                      {[1, 5, 10, 25, 50, 100].map(pct => {
                        const active = rolloutPercentage === pct;
                        return (
                          <TouchableOpacity
                            key={pct}
                            style={[styles.rolloutBtn, active && styles.rolloutBtnActive]}
                            onPress={() => {
                              setRolloutPercentage(pct);
                              showToast(`Call features rolled out to ${pct}% of users.`);
                              addAuditLog('ROLLOUT_STAGE', `calls_${pct}%`);
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

            {/* 10. DEVELOPER CENTER */}
            {activeTab === 'developer' && (
              <View>
                {renderSectionHeader('Developer Diagnostic Console', <FileText size={20} color="#FFFC00" />)}
                <View style={styles.glassCardBig}>
                  <Text style={styles.cardTitle}>Run Diagnostics</Text>
                  <Text style={styles.storageSubtext}>Trigger network health reports, test notifications, or clear heap memory.</Text>
                  
                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.actionOutlineBtn} onPress={() => {
                      showToast('Notification test payload dispatched.');
                      addAuditLog('TEST_PUSH_NOTIF', 'AdminDevice');
                    }}>
                      <Text style={styles.actionOutlineBtnText}>Test Push</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionOutlineBtn} onPress={() => {
                      showToast('Database integrity test: 100% OK');
                      addAuditLog('RUN_DIAGNOSTICS', 'Supabase');
                    }}>
                      <Text style={styles.actionOutlineBtnText}>Run Database Check</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* 11. AUDIT LOGS */}
            {activeTab === 'audit' && (
              <View>
                {renderSectionHeader('Immutable Audit Logs', <CheckCircle size={20} color="#FFFC00" />)}
                <View style={styles.auditContainer}>
                  {auditLogs.map(audit => (
                    <View key={audit.id} style={styles.auditRow}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={styles.auditAction}>{audit.action}</Text>
                        <Text style={styles.auditTime}>{audit.time}</Text>
                      </View>
                      <Text style={styles.auditTarget}>Target: {audit.target} ({audit.status})</Text>
                      <Text style={styles.auditMeta}>Admin: {audit.admin} | IP: {audit.ip}</Text>
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
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#30D158',
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
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
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
  timelineContainer: {
    backgroundColor: '#0A0A0C',
    borderRadius: 12,
    padding: 12,
  },
  timelineRow: {
    color: '#8E8E93',
    fontSize: 12,
    marginVertical: 4,
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
  riskLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    marginRight: 6,
  },
  storageNumber: {
    color: '#FFFC00',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  storageLabel: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 4,
  },
  storageMeter: {
    height: 8,
    backgroundColor: '#2C2C2E',
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  storageProgress: {
    height: '100%',
    backgroundColor: '#FFFC00',
  },
  storageSubtext: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 8,
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
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 200,
    paddingTop: 16,
  },
  chartBar: {
    width: '18%',
    backgroundColor: '#2C2C2E',
    borderRadius: 6,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
  },
  barText: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
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
