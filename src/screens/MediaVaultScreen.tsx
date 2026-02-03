import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { MediaItem, UserAccount } from '../types';
import {
  saveMedia,
  deleteMedia,
  loadVaultData,
  loadThumbnailsWithProgress,
  getMediaCounts,
} from '../services/mediaStorageService';
import { EncryptedMediaMetadata } from '../types';
import { getSecretKey } from '../services/keychainService';
import {
  ensureCameraPermission,
  ensurePhotoLibraryPermission,
} from '../services/permissionService';
import MediaViewerScreen from './MediaViewerScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_MARGIN = 2;
const ITEM_SIZE = (SCREEN_WIDTH - ITEM_MARGIN * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

interface MediaVaultScreenProps {
  user: UserAccount;
  onClose: () => void;
}

interface ThumbnailCache {
  [id: string]: string | null;
}

const MediaVaultScreen: React.FC<MediaVaultScreenProps> = ({ user, onClose }) => {
  const { colors, isDarkMode } = useTheme();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [thumbnailCache, setThumbnailCache] = useState<ThumbnailCache>({});
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [counts, setCounts] = useState({ photos: 0, videos: 0, documents: 0, total: 0 });
  const [filter, setFilter] = useState<'all' | 'photo' | 'video' | 'document'>('all');
  const [mediaIndex, setMediaIndex] = useState<EncryptedMediaMetadata[]>([]);

  useEffect(() => {
    loadVault();
  }, []);

  const loadVault = async () => {
    setIsLoading(true);
    try {
      const keyResult = await getSecretKey();
      if (!keyResult.success || !keyResult.value) {
        Alert.alert('Authentication Failed', 'Could not access your encryption key.');
        onClose();
        return;
      }

      setSecretKey(keyResult.value);
      
      // Single optimized call to load all vault data
      const { index, items, counts: mediaCounts } = await loadVaultData();
      setMediaIndex(index);
      setMediaItems(items);
      setCounts(mediaCounts);
      
      // Show UI immediately, then load thumbnails progressively in background
      setIsLoading(false);
      
      // Load thumbnails with batch updates (parallel with concurrency limit)
      // Batching reduces re-renders for better performance
      loadThumbnailsWithProgress(
        index,
        keyResult.value,
        (batch) => {
          // Merge entire batch at once - single state update per batch
          setThumbnailCache(prev => ({ ...prev, ...batch }));
        },
        6 // Load 6 thumbnails in parallel per batch
      );
    } catch (error) {
      console.error('Error loading vault:', error);
      Alert.alert('Error', 'Failed to load your vault.');
      setIsLoading(false);
    }
  };

  // Reload vault data after adding/deleting items
  const refreshVault = async () => {
    if (!secretKey) return;
    
    const { index, items, counts: mediaCounts } = await loadVaultData();
    setMediaIndex(index);
    setMediaItems(items);
    setCounts(mediaCounts);
    
    // Reload thumbnails for any new items
    loadThumbnailsWithProgress(
      index,
      secretKey,
      (batch) => {
        setThumbnailCache(prev => ({ ...prev, ...batch }));
      },
      6
    );
  };

  const handleAddFromGallery = async () => {
    setShowAddOptions(false);
    
    // Check photo library permission
    const hasPermission = await ensurePhotoLibraryPermission();
    if (!hasPermission) {
      return;
    }
    
    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        includeBase64: false,
        quality: 1,
        selectionLimit: 10,
      });

      if (result.didCancel || !result.assets) return;

      setIsSaving(true);
      
      for (const asset of result.assets) {
        if (asset.uri && secretKey) {
          const filename = asset.fileName || `media_${Date.now()}`;
          const mimeType = asset.type || 'application/octet-stream';
          
          await saveMedia(asset.uri, filename, mimeType, secretKey);
        }
      }

      await refreshVault();
    } catch (error) {
      console.error('Error adding from gallery:', error);
      Alert.alert('Error', 'Failed to add media from gallery.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFromCamera = async () => {
    setShowAddOptions(false);
    
    // Check camera permission
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) {
      return;
    }
    
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: false,
        quality: 1,
        saveToPhotos: false,
      });

      if (result.didCancel || !result.assets || !result.assets[0]) return;

      setIsSaving(true);
      
      const asset = result.assets[0];
      if (asset.uri && secretKey) {
        const filename = asset.fileName || `camera_${Date.now()}.jpg`;
        const mimeType = asset.type || 'image/jpeg';
        
        await saveMedia(asset.uri, filename, mimeType, secretKey);
        await refreshVault();
      }
    } catch (error) {
      console.error('Error adding from camera:', error);
      Alert.alert('Error', 'Failed to capture photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDocument = async () => {
    setShowAddOptions(false);
    
    try {
      // Use copyTo to get a file:// URI instead of content:// on Android
      // This fixes the "file not found" error for PDFs and other documents
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.plainText, DocumentPicker.types.doc, DocumentPicker.types.docx],
        allowMultiSelection: true,
        copyTo: 'cachesDirectory',
      });

      setIsSaving(true);
      
      for (const doc of results) {
        // Use fileCopyUri (file://) if available, otherwise fall back to uri
        // fileCopyUri is a local file copy that react-native-fs can read
        const fileUri = doc.fileCopyUri || doc.uri;
        
        if (fileUri && secretKey) {
          const filename = doc.name || `document_${Date.now()}`;
          const mimeType = doc.type || 'application/octet-stream';
          
          await saveMedia(fileUri, filename, mimeType, secretKey);
        }
      }

      await refreshVault();
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        console.error('Error adding document:', error);
        Alert.alert('Error', 'Failed to add document.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMedia = useCallback(async (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to permanently delete this item? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteMedia(id);
            if (success) {
              setMediaItems(prev => prev.filter(item => item.id !== id));
              const mediaCounts = await getMediaCounts();
              setCounts(mediaCounts);
            } else {
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ],
    );
  }, []);

  const filteredItems = filter === 'all' 
    ? mediaItems 
    : mediaItems.filter(item => item.type === filter);

  const getIconForType = (type: MediaItem['type']): { name: string; library: 'material' | 'ionicon' } => {
    switch (type) {
      case 'photo': return { name: 'image', library: 'material' };
      case 'video': return { name: 'videocam', library: 'material' };
      case 'document': return { name: 'description', library: 'material' };
      default: return { name: 'folder', library: 'material' };
    }
  };

  const renderTypeIcon = (type: MediaItem['type'], size: number = 40) => {
    const iconInfo = getIconForType(type);
    return <MaterialIcons name={iconInfo.name} size={size} color={colors.primary} />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMediaItem = ({ item }: { item: MediaItem }) => {
    const thumbnail = thumbnailCache[item.id];
    
    return (
      <TouchableOpacity
        style={[styles.mediaItem, { backgroundColor: colors.card }]}
        onPress={() => setSelectedMedia(item)}
        onLongPress={() => handleDeleteMedia(item.id)}
        activeOpacity={0.7}
      >
        {item.type === 'photo' && thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
            {renderTypeIcon(item.type)}
          </View>
        )}
        
        {item.type === 'video' && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>▶</Text>
          </View>
        )}
        
        {item.type === 'document' && (
          <View style={styles.documentInfo}>
            <Text style={[styles.documentName, { color: colors.text }]} numberOfLines={1}>
              {item.filename}
            </Text>
            <Text style={[styles.documentSize, { color: colors.textSecondary }]}>
              {formatFileSize(item.fileSize)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Unlocking your vault...
        </Text>
      </SafeAreaView>
    );
  }

  if (selectedMedia && secretKey) {
    return (
      <MediaViewerScreen
        media={selectedMedia}
        secretKey={secretKey}
        onClose={() => setSelectedMedia(null)}
        onDelete={() => {
          handleDeleteMedia(selectedMedia.id);
          setSelectedMedia(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.headerBg}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Secure Vault</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {counts.total} item{counts.total !== 1 ? 's' : ''} encrypted
          </Text>
        </View>

        <TouchableOpacity 
          onPress={() => setShowAddOptions(true)} 
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.addButtonText}>+</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterTabs, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        {[
          { key: 'all', label: 'All', count: counts.total },
          { key: 'photo', label: 'Photos', count: counts.photos },
          { key: 'video', label: 'Videos', count: counts.videos },
          { key: 'document', label: 'Docs', count: counts.documents },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterTab,
              filter === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setFilter(tab.key as typeof filter)}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: filter === tab.key ? colors.primary : colors.textSecondary },
              ]}
            >
              {tab.label} ({tab.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {filteredItems.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="lock" size={64} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {filter === 'all' ? 'Your vault is empty' : `No ${filter}s yet`}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Tap + to add encrypted files
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderMediaItem}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Hint */}
      <View style={[styles.hintBar, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          Long press to delete • All files encrypted with XSalsa20-Poly1305
        </Text>
      </View>

      {/* Add Options Modal */}
      <Modal
        visible={showAddOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddOptions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddOptions(false)}
        >
          <View style={[styles.addOptionsContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.addOptionsTitle, { color: colors.text }]}>
              Add to Vault
            </Text>
            
            <TouchableOpacity
              style={[styles.addOption, { borderBottomColor: colors.border }]}
              onPress={handleAddFromCamera}
            >
              <MaterialIcons name="camera-alt" size={24} color={colors.primary} style={styles.addOptionIcon} />
              <Text style={[styles.addOptionText, { color: colors.text }]}>
                Take Photo
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.addOption, { borderBottomColor: colors.border }]}
              onPress={handleAddFromGallery}
            >
              <MaterialIcons name="photo-library" size={24} color={colors.primary} style={styles.addOptionIcon} />
              <Text style={[styles.addOptionText, { color: colors.text }]}>
                Photo & Video Library
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.addOption}
              onPress={handleAddDocument}
            >
              <MaterialIcons name="insert-drive-file" size={24} color={colors.primary} style={styles.addOptionIcon} />
              <Text style={[styles.addOptionText, { color: colors.text }]}>
                Document / PDF
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.border }]}
              onPress={() => setShowAddOptions(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backIcon: {
    fontSize: 24,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginTop: -2,
  },
  filterTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  grid: {
    padding: ITEM_MARGIN,
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: ITEM_MARGIN,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  iconContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 40,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 10,
  },
  documentInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  documentName: {
    fontSize: 10,
    fontWeight: '500',
  },
  documentSize: {
    fontSize: 9,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  hintBar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  addOptionsContainer: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  addOptionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 16,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  addOptionIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  addOptionText: {
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MediaVaultScreen;

