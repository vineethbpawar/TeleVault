import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Search, Image as ImageIcon, Video, Calendar, RefreshCw } from 'lucide-react-native';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from '../types/navigation';
import { fileService } from '../services/fileService';
import { TeleVaultFile } from '../types/file';
import EmptyState from '../components/EmptyState';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'MemoriesTab'>,
  NativeStackScreenProps<AppStackParamList>
>;

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 48) / 3;

interface GroupedMemories {
  title: string;
  data: TeleVaultFile[];
}

export const MemoriesScreen: React.FC<Props> = ({ navigation }) => {
  const [files, setFiles] = useState<TeleVaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const isFocused = useIsFocused();

  const loadMemories = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await fileService.fetchMemories();
      setFiles(data);
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadMemories(true);
    }
  }, [isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMemories(false);
  }, []);

  const getFilteredFiles = () => {
    return files.filter((file) => {
      const matchesSearch = file.file_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || file.file_type === filterType;
      return matchesSearch && matchesType;
    });
  };

  const getGroupedMemories = () => {
    const filtered = getFilteredFiles();
    const today: TeleVaultFile[] = [];
    const yesterday: TeleVaultFile[] = [];
    const thisMonth: TeleVaultFile[] = [];
    const older: TeleVaultFile[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    filtered.forEach((file) => {
      const fileDate = new Date(file.created_at);
      if (fileDate >= startOfToday) {
        today.push(file);
      } else if (fileDate >= startOfYesterday) {
        yesterday.push(file);
      } else if (fileDate >= startOfThisMonth) {
        thisMonth.push(file);
      } else {
        older.push(file);
      }
    });

    const sections: GroupedMemories[] = [];
    if (today.length > 0) sections.push({ title: 'Today', data: today });
    if (yesterday.length > 0) sections.push({ title: 'Yesterday', data: yesterday });
    if (thisMonth.length > 0) sections.push({ title: 'This Month', data: thisMonth });
    if (older.length > 0) sections.push({ title: 'Older', data: older });

    return sections;
  };

  const renderGridItem = ({ item }: { item: TeleVaultFile }) => {
    const isVideo = item.file_type === 'video';

    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => navigation.navigate('FileDetails', { file: item })}
        activeOpacity={0.8}
      >
        {item.local_thumbnail_uri ? (
          <Image source={{ uri: item.local_thumbnail_uri }} style={styles.gridImage} />
        ) : (
          <View style={styles.placeholderGrid}>
            {isVideo ? (
              <Video size={28} color="#FFFC00" />
            ) : (
              <ImageIcon size={28} color="#FFFC00" />
            )}
          </View>
        )}
        {isVideo && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>▶</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const groupedData = getGroupedMemories();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memories</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color="#8E8E93" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search memories..."
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Filters (All, Photos, Videos) */}
      <View style={styles.filterTabs}>
        {(['all', 'image', 'video'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterTab, filterType === type && styles.activeFilterTab]}
            onPress={() => setFilterType(type)}
          >
            <Text style={[styles.filterTabText, filterType === type && styles.activeFilterTabText]}>
              {type === 'all' ? 'All' : type === 'image' ? 'Photos' : 'Videos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FFFC00" />
        </View>
      ) : groupedData.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          ListEmptyComponent={
            <EmptyState
              title="No Memories Found"
              description="Capture moments in Camera or upload photos/videos to populate your Snapchat-style Memories."
            />
          }
        />
      ) : (
        <FlatList
          data={groupedData}
          keyExtractor={(item) => item.title}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFC00" />}
          renderItem={({ item }) => (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Calendar size={14} color="#8E8E93" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>{item.title}</Text>
              </View>
              <FlatList
                data={item.data}
                keyExtractor={(file) => file.id}
                numColumns={3}
                renderItem={renderGridItem}
                scrollEnabled={false}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  activeFilterTab: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
  },
  filterTabText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  activeFilterTabText: {
    color: '#000000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionContainer: {
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingLeft: 4,
  },
  sectionTitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    margin: 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  placeholderGrid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    marginLeft: 1,
  },
});

export default MemoriesScreen;
