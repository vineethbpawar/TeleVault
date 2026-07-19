/**
 * Call History Screen
 *
 * Displays the user's call history including voice, video, missed, rejected calls.
 * Features:
 * - Live search filter & Search button in header
 * - Quick navigate to UserSearch to start new calls
 * - Re-dialing from call logs
 * - Clear history action
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Search, X, UserPlus, PhoneCall, Trash2, ArrowLeft } from 'lucide-react-native';
import { AppStackParamList } from '../types/navigation';
import { CallHistoryEntry } from '../types/call';
import { callHistoryService } from '../services/callHistoryService';
import { callingService } from '../services/callingService';
import { UserAvatar } from '../components/UserAvatar';
import { callStateStore } from '../services/callStateStore';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const CallHistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const [history, setHistory] = useState<CallHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const entries = await callHistoryService.getCallHistory(50);
      setHistory(entries);
    } catch (err) {
      console.error('CallHistoryScreen fetchHistory error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const handleCallBack = async (entry: CallHistoryEntry) => {
    if (!entry.other_user) return;
    if (callStateStore.isInCall()) {
      Alert.alert('Already in a call', 'Please end the current call first.');
      return;
    }

    const success = await callingService.initiateCall({
      targetUserId: entry.other_user_id!,
      targetProfile: entry.other_user,
      callType: entry.call_type,
    });

    if (!success) {
      Alert.alert('Call failed', 'Could not initiate call. Check permissions and connection.');
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Call History',
      'Are you sure you want to delete all call history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await callHistoryService.clearCallHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  const handleOpenSearchUsers = () => {
    navigation.navigate('UserSearch', { mode: 'chat' });
  };

  const filteredHistory = history.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const name = (item.other_user?.full_name || '').toLowerCase();
    const username = (item.other_user?.username || '').toLowerCase();
    const status = (item.status || '').toLowerCase();
    const type = (item.call_type || '').toLowerCase();
    return name.includes(q) || username.includes(q) || status.includes(q) || type.includes(q);
  });

  const getCallIcon = (entry: CallHistoryEntry): string => {
    if (entry.status === 'missed') return '📵';
    if (entry.status === 'rejected') return '❌';
    if (entry.status === 'cancelled') return '↩️';
    if (entry.status === 'busy') return '🔴';
    if (entry.call_type === 'video') return '📹';
    return '📞';
  };

  const getCallDirectionIcon = (entry: CallHistoryEntry): string => {
    if (entry.direction === 'incoming') {
      return entry.status === 'missed' ? '↙️' : '📲';
    }
    return '📤';
  };

  const getStatusColor = (entry: CallHistoryEntry): string => {
    if (entry.status === 'missed') return '#FF3B30';
    if (entry.status === 'rejected') return '#FF9F0A';
    if (entry.status === 'connected' || entry.status === 'ended') return '#34C759';
    return '#A0A8C0';
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderItem = ({ item }: { item: CallHistoryEntry }) => {
    const name =
      item.other_user?.full_name || item.other_user?.username || 'Unknown';

    return (
      <TouchableOpacity
        style={styles.historyItem}
        onPress={() => handleCallBack(item)}
        activeOpacity={0.7}
      >
        <UserAvatar
          name={name}
          avatarUrl={item.other_user?.avatar_url}
          size={48}
        />

        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{name}</Text>
          <View style={styles.itemMeta}>
            <Text style={styles.itemDirectionIcon}>{getCallDirectionIcon(item)}</Text>
            <Text style={[styles.itemStatus, { color: getStatusColor(item) }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
            {item.duration_seconds > 0 && (
              <Text style={styles.itemDuration}>
                · {formatDuration(item.duration_seconds)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.itemRight}>
          <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
          <Text style={styles.callTypeIcon}>{getCallIcon(item)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color="#FFFC00" size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top > 0 ? insets.top : 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        {isSearchVisible ? (
          <View style={styles.searchBarContainer}>
            <Search size={18} color="#8E98B7" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search calls or usernames..."
              placeholderTextColor="#6B7FCC"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <X size={16} color="#8E98B7" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                setIsSearchVisible(false);
                setSearchQuery('');
              }}
              style={styles.cancelSearchBtn}
            >
              <Text style={styles.cancelSearchText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.iconBtn}
            >
              <ArrowLeft size={22} color="#FFFC00" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Calls</Text>

            <View style={styles.headerRightActions}>
              <TouchableOpacity
                onPress={() => setIsSearchVisible(true)}
                style={styles.iconBtn}
                activeOpacity={0.7}
              >
                <Search size={20} color="#FFFC00" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleOpenSearchUsers}
                style={styles.iconBtn}
                activeOpacity={0.7}
              >
                <UserPlus size={20} color="#FFFC00" />
              </TouchableOpacity>

              {history.length > 0 && (
                <TouchableOpacity onPress={handleClearHistory} style={styles.iconBtn}>
                  <Trash2 size={18} color="#FF3B30" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Start New Call Banner / Shortcut */}
      <TouchableOpacity
        style={styles.startCallBanner}
        onPress={handleOpenSearchUsers}
        activeOpacity={0.8}
      >
        <View style={styles.bannerIconWrapper}>
          <PhoneCall size={20} color="#000000" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Make a New Call</Text>
          <Text style={styles.bannerSubtitle}>Search friends & users to start voice or video call</Text>
        </View>
      </TouchableOpacity>

      <FlatList
        data={filteredHistory}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FFFC00"
          />
        }
        contentContainerStyle={
          filteredHistory.length === 0 ? styles.emptyContent : styles.listContent
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📞</Text>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No matching calls found' : 'No call history'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No calls matching "${searchQuery}"`
                : 'Your calls will appear here after you make or receive your first call.'}
            </Text>
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.searchUserActionBtn}
                onPress={handleOpenSearchUsers}
              >
                <Text style={styles.searchUserActionText}>Search Users to Call</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D1F',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0A0D1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F38',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 252, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
    marginLeft: 12,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
  },
  cancelSearchBtn: {
    marginLeft: 10,
    paddingHorizontal: 6,
  },
  cancelSearchText: {
    color: '#FFFC00',
    fontSize: 14,
    fontWeight: '700',
  },
  startCallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.12)',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 0, 0.3)',
    gap: 12,
  },
  bannerIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  bannerSubtitle: {
    color: '#8E98B7',
    fontSize: 12,
    marginTop: 2,
  },
  listContent: {
    paddingVertical: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1F38',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  itemDirectionIcon: {
    fontSize: 12,
  },
  itemStatus: {
    fontSize: 13,
    fontWeight: '500',
  },
  itemDuration: {
    color: '#A0A8C0',
    fontSize: 13,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemDate: {
    color: '#6B7FCC',
    fontSize: 12,
  },
  callTypeIcon: {
    fontSize: 18,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 60,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#6B7FCC',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  searchUserActionBtn: {
    backgroundColor: '#FFFC00',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 8,
  },
  searchUserActionText: {
    color: '#0A0D1F',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default CallHistoryScreen;
