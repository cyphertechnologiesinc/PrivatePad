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
import { MediaItem, UserAccount, PrivatePadEncryptedFile } from '../types';
import {
  saveMedia,
  loadVaultData,
  loadThumbnailsWithProgress,
  getMediaCounts,
  secureDeleteMedia,
  setMediaPassword,
  removeMediaPassword,
  loadProtectedMedia,
  parseEncryptedBundle,
  verifyBundlePassword,
  importEncryptedBundle,
  exportAsEncryptedBundle,
  exportProtectedMediaForSharing,
  cleanupTempFiles,
} from '../services/mediaStorageService';
import { EncryptedMediaMetadata } from '../types';
import { getSecretKey } from '../services/keychainService';
import {
  ensureCameraPermission,
  ensurePhotoLibraryPermission,
} from '../services/permissionService';
import MediaViewerScreen from './MediaViewerScreen';
import PasswordModal, { PasswordModalMode } from '../components/PasswordModal';
import MediaItemActionSheet from '../components/MediaItemActionSheet';
import ImportChoiceModal from '../components/ImportChoiceModal';
import { Share, Platform } from 'react-native';

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
  
  // Action sheet and password modal state
  const [actionSheetItem, setActionSheetItem] = useState<MediaItem | null>(null);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordModalMode, setPasswordModalMode] = useState<PasswordModalMode>('set');
  const [pendingPasswordItem, setPendingPasswordItem] = useState<MediaItem | null>(null);
  const [pendingViewPassword, setPendingViewPassword] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Import .ppenc state
  const [pendingImportBundle, setPendingImportBundle] = useState<PrivatePadEncryptedFile | null>(null);
  const [pendingImportPassword, setPendingImportPassword] = useState<string | null>(null);
  const [showImportChoice, setShowImportChoice] = useState(false);
  
  // Share encrypted state
  const [pendingShareAction, setPendingShareAction] = useState<'encrypted' | 'decrypted' | null>(null);

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

  // Check if an item is password protected
  const isItemPasswordProtected = useCallback((id: string): boolean => {
    const metadata = mediaIndex.find((item) => item.id === id);
    return metadata?.isPasswordProtected ?? false;
  }, [mediaIndex]);

  // Handle long press - show action sheet
  const handleLongPress = useCallback((item: MediaItem) => {
    setActionSheetItem(item);
  }, []);

  // Handle secure delete
  const handleSecureDelete = useCallback(async (id: string) => {
    setActionSheetItem(null);
    
    Alert.alert(
      'Secure Delete',
      'This will permanently erase this item with a secure overwrite. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            const success = await secureDeleteMedia(id);
            setIsProcessing(false);
            
            if (success) {
              setMediaItems(prev => prev.filter(item => item.id !== id));
              const mediaCounts = await getMediaCounts();
              setCounts(mediaCounts);
              // Also update the index
              setMediaIndex(prev => prev.filter(item => item.id !== id));
            } else {
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ],
    );
  }, []);

  // Handle set password action
  const handleSetPasswordAction = useCallback(() => {
    if (!actionSheetItem) return;
    setPendingPasswordItem(actionSheetItem);
    setPasswordModalMode('set');
    setActionSheetItem(null);
    setPasswordModalVisible(true);
  }, [actionSheetItem]);

  // Handle remove password action
  const handleRemovePasswordAction = useCallback(() => {
    if (!actionSheetItem) return;
    setPendingPasswordItem(actionSheetItem);
    setPasswordModalMode('remove');
    setActionSheetItem(null);
    setPasswordModalVisible(true);
  }, [actionSheetItem]);

  // Handle password submission
  const handlePasswordSubmit = useCallback(async (password: string): Promise<boolean> => {
    if (!pendingPasswordItem || !secretKey) return false;

    setIsProcessing(true);
    try {
      if (passwordModalMode === 'set') {
        const success = await setMediaPassword(pendingPasswordItem.id, password, secretKey);
        if (success) {
          await refreshVault();
          setPasswordModalVisible(false);
          setPendingPasswordItem(null);
          Alert.alert('Success', 'Password protection added.');
          return true;
        }
        return false;
      } else if (passwordModalMode === 'remove') {
        const success = await removeMediaPassword(pendingPasswordItem.id, password, secretKey);
        if (success) {
          await refreshVault();
          setPasswordModalVisible(false);
          setPendingPasswordItem(null);
          Alert.alert('Success', 'Password protection removed.');
          return true;
        }
        return false;
      } else if (passwordModalMode === 'enter') {
        // Verify the password by attempting to load the media
        const result = await loadProtectedMedia(pendingPasswordItem.id, password);
        if (result) {
          // Password correct - store it temporarily and open the viewer
          setPendingViewPassword(password);
          setPasswordModalVisible(false);
          setSelectedMedia(pendingPasswordItem);
          setPendingPasswordItem(null);
          return true;
        }
        return false;
      }
    } finally {
      setIsProcessing(false);
    }
    return false;
  }, [pendingPasswordItem, secretKey, passwordModalMode, refreshVault]);

  // Handle media item press
  const handleMediaPress = useCallback((item: MediaItem) => {
    const isProtected = isItemPasswordProtected(item.id);
    
    if (isProtected) {
      // Show password entry modal
      setPendingPasswordItem(item);
      setPasswordModalMode('enter');
      setPasswordModalVisible(true);
    } else {
      // Open normally
      setPendingViewPassword(null);
      setSelectedMedia(item);
    }
  }, [isItemPasswordProtected]);

  // Handle password modal cancel
  const handlePasswordCancel = useCallback(() => {
    setPasswordModalVisible(false);
    setPendingPasswordItem(null);
    setPendingImportBundle(null);
    setPendingShareAction(null);
  }, []);

  // ============================================
  // Import .ppenc Handlers
  // ============================================

  // Handle importing an encrypted .ppenc file
  const handleImportEncryptedFile = async () => {
    setShowAddOptions(false);
    
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });

      const doc = results[0];
      const fileUri = doc.fileCopyUri || doc.uri;
      
      // Check if it's a .ppenc file
      if (!doc.name?.toLowerCase().endsWith('.ppenc')) {
        Alert.alert('Invalid File', 'Please select a .ppenc encrypted file.');
        return;
      }

      setIsSaving(true);
      
      // Parse the bundle
      const bundle = await parseEncryptedBundle(fileUri);
      
      if (!bundle) {
        Alert.alert('Invalid File', 'Could not read the encrypted file. It may be corrupted or invalid.');
        setIsSaving(false);
        return;
      }

      // Store the bundle and show password modal
      setPendingImportBundle(bundle);
      setPasswordModalMode('enter');
      setPasswordModalVisible(true);
      setIsSaving(false);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        console.error('Error importing encrypted file:', error);
        Alert.alert('Error', 'Failed to import encrypted file.');
      }
      setIsSaving(false);
    }
  };

  // Extended password submit to handle import flow
  const handleExtendedPasswordSubmit = useCallback(async (password: string): Promise<boolean> => {
    // Handle .ppenc import
    if (pendingImportBundle) {
      setIsProcessing(true);
      try {
        // Verify the password
        const isValid = verifyBundlePassword(pendingImportBundle, password);
        if (!isValid) {
          return false; // Wrong password
        }
        
        // Password correct - show import choice modal
        setPendingImportPassword(password);
        setPasswordModalVisible(false);
        setShowImportChoice(true);
        return true;
      } finally {
        setIsProcessing(false);
      }
    }
    
    // Handle share encrypted action
    if (pendingShareAction === 'encrypted' && pendingPasswordItem && secretKey) {
      setIsProcessing(true);
      try {
        const tempPath = await exportAsEncryptedBundle(pendingPasswordItem.id, password);
        if (tempPath) {
          setPasswordModalVisible(false);
          setPendingPasswordItem(null);
          setPendingShareAction(null);
          
          // Share the .ppenc file
          await Share.share({
            url: Platform.OS === 'ios' ? tempPath : `file://${tempPath}`,
            title: `${pendingPasswordItem.filename}.ppenc`,
          });
          
          // Clean up
          await cleanupTempFiles();
          return true;
        }
        return false;
      } finally {
        setIsProcessing(false);
      }
    }
    
    // Handle share decrypted action
    if (pendingShareAction === 'decrypted' && pendingPasswordItem) {
      setIsProcessing(true);
      try {
        const tempPath = await exportProtectedMediaForSharing(pendingPasswordItem.id, password);
        if (tempPath) {
          setPasswordModalVisible(false);
          setPendingPasswordItem(null);
          setPendingShareAction(null);
          
          // Share the decrypted file
          await Share.share({
            url: Platform.OS === 'ios' ? tempPath : `file://${tempPath}`,
            title: pendingPasswordItem.filename,
          });
          
          // Clean up
          await cleanupTempFiles();
          return true;
        }
        return false;
      } finally {
        setIsProcessing(false);
      }
    }
    
    // Fall back to original password submit handler
    return handlePasswordSubmit(password);
  }, [pendingImportBundle, pendingShareAction, pendingPasswordItem, secretKey, handlePasswordSubmit]);

  // Handle import choice (keep protected or convert to master key)
  const handleImportWithChoice = async (keepProtected: boolean) => {
    if (!pendingImportBundle || !pendingImportPassword || !secretKey) return;
    
    setShowImportChoice(false);
    setIsSaving(true);
    
    try {
      const imported = await importEncryptedBundle(
        pendingImportBundle,
        pendingImportPassword,
        secretKey,
        keepProtected
      );
      
      if (imported) {
        await refreshVault();
        Alert.alert('Success', `"${imported.filename}" imported successfully.`);
      } else {
        Alert.alert('Error', 'Failed to import file.');
      }
    } catch (error) {
      console.error('Error importing:', error);
      Alert.alert('Error', 'Failed to import file.');
    } finally {
      setPendingImportBundle(null);
      setPendingImportPassword(null);
      setIsSaving(false);
    }
  };

  // ============================================
  // Share Encrypted/Decrypted Handlers
  // ============================================

  const handleShareEncryptedAction = useCallback(() => {
    if (!actionSheetItem) return;
    setPendingPasswordItem(actionSheetItem);
    setPendingShareAction('encrypted');
    setPasswordModalMode('enter');
    setActionSheetItem(null);
    setPasswordModalVisible(true);
  }, [actionSheetItem]);

  const handleShareDecryptedAction = useCallback(() => {
    if (!actionSheetItem) return;
    setPendingPasswordItem(actionSheetItem);
    setPendingShareAction('decrypted');
    setPasswordModalMode('enter');
    setActionSheetItem(null);
    setPasswordModalVisible(true);
  }, [actionSheetItem]);

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
    const isProtected = isItemPasswordProtected(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.mediaItem, { backgroundColor: colors.card }]}
        onPress={() => handleMediaPress(item)}
        onLongPress={() => handleLongPress(item)}
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

        {/* Lock badge for password-protected items */}
        {isProtected && (
          <View style={styles.lockBadge}>
            <MaterialIcons name="lock" size={14} color="#fff" />
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
    const isSelectedProtected = isItemPasswordProtected(selectedMedia.id);
    return (
      <MediaViewerScreen
        media={selectedMedia}
        secretKey={secretKey}
        onClose={() => {
          setSelectedMedia(null);
          setPendingViewPassword(null);
        }}
        onDelete={() => {
          handleSecureDelete(selectedMedia.id);
          setSelectedMedia(null);
          setPendingViewPassword(null);
        }}
        password={isSelectedProtected ? pendingViewPassword ?? undefined : undefined}
        isPasswordProtected={isSelectedProtected}
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
          Long press for options • XSalsa20-Poly1305 encryption
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
              style={[styles.addOption, { borderBottomColor: colors.border }]}
              onPress={handleAddDocument}
            >
              <MaterialIcons name="insert-drive-file" size={24} color={colors.primary} style={styles.addOptionIcon} />
              <Text style={[styles.addOptionText, { color: colors.text }]}>
                Document / PDF
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addOption}
              onPress={handleImportEncryptedFile}
            >
              <MaterialIcons name="enhanced-encryption" size={24} color={colors.primary} style={styles.addOptionIcon} />
              <Text style={[styles.addOptionText, { color: colors.text }]}>
                Import Encrypted (.ppenc)
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

      {/* Item Action Sheet */}
      <MediaItemActionSheet
        visible={!!actionSheetItem}
        isPasswordProtected={actionSheetItem ? isItemPasswordProtected(actionSheetItem.id) : false}
        onSetPassword={handleSetPasswordAction}
        onRemovePassword={handleRemovePasswordAction}
        onShareDecrypted={handleShareDecryptedAction}
        onShareEncrypted={handleShareEncryptedAction}
        onDelete={() => actionSheetItem && handleSecureDelete(actionSheetItem.id)}
        onCancel={() => setActionSheetItem(null)}
        itemName={actionSheetItem?.filename}
      />

      {/* Password Modal */}
      <PasswordModal
        visible={passwordModalVisible}
        mode={passwordModalMode}
        onSubmit={handleExtendedPasswordSubmit}
        onCancel={handlePasswordCancel}
        isLoading={isProcessing}
      />

      {/* Import Choice Modal */}
      <ImportChoiceModal
        visible={showImportChoice}
        filename={pendingImportBundle?.filename ?? ''}
        onKeepProtected={() => handleImportWithChoice(true)}
        onRemoveProtection={() => handleImportWithChoice(false)}
        onCancel={() => {
          setShowImportChoice(false);
          setPendingImportBundle(null);
          setPendingImportPassword(null);
        }}
      />
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
  lockBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
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

