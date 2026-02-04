import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
  StatusBar,
  Dimensions,
  Platform,
  Modal,
} from 'react-native';
import RNShare from 'react-native-share';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';

// Lazy load video component to avoid initialization issues
let VideoComponent: any = null;
try {
  VideoComponent = require('react-native-video').default;
} catch (e) {
  console.warn('react-native-video not available:', e);
}

// Note: react-native-pdf has issues with react-native-blob-util
// We'll handle PDFs by sharing to external apps instead
import { MediaItem } from '../types';
import {
  loadMedia,
  loadProtectedMedia,
  exportMediaForSharing,
  exportProtectedMediaForSharing,
  exportAsEncryptedBundle,
  cleanupTempFiles,
} from '../services/mediaStorageService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MediaViewerScreenProps {
  media: MediaItem;
  secretKey: string;
  onClose: () => void;
  onDelete: () => void;
  password?: string; // Password for protected files
  isPasswordProtected?: boolean;
}

const MediaViewerScreen: React.FC<MediaViewerScreenProps> = ({
  media,
  secretKey,
  onClose,
  onDelete,
  password,
  isPasswordProtected = false,
}) => {
  const { colors, isDarkMode } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);

  useEffect(() => {
    loadMediaContent();
    
    return () => {
      // Clean up temp files when leaving
      cleanupTempFiles();
    };
  }, [media.id, password]);

  const loadMediaContent = async () => {
    setIsLoading(true);
    setVideoError(false);
    
    try {
      let uri: string | null = null;
      
      if (isPasswordProtected && password) {
        // Load with password-derived key
        uri = await loadProtectedMedia(media.id, password);
      } else {
        // Load with master key
        uri = await loadMedia(media.id, secretKey);
      }
      
      setMediaUri(uri);
    } catch (error) {
      console.error('Error loading media:', error);
      Alert.alert('Error', 'Failed to load media.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = () => {
    if (isPasswordProtected && password) {
      // Show share options for protected files
      setShowShareOptions(true);
    } else {
      // Non-protected files: share directly
      handleShareDecrypted();
    }
  };

  const handleShareDecrypted = async () => {
    setShowShareOptions(false);
    setIsSharing(true);
    
    try {
      let tempPath: string | null = null;
      
      if (isPasswordProtected && password) {
        // Use password to decrypt for sharing
        tempPath = await exportProtectedMediaForSharing(media.id, password);
      } else {
        // Use master key
        tempPath = await exportMediaForSharing(media.id, secretKey);
      }
      
      if (tempPath) {
        const fileUrl = Platform.OS === 'ios' ? tempPath : `file://${tempPath}`;
        await RNShare.open({
          url: fileUrl,
          filename: media.filename,
          type: media.mimeType,
          failOnCancel: false,
        });
        
        // Clean up after sharing
        await cleanupTempFiles();
      } else {
        Alert.alert('Error', 'Failed to prepare file for sharing.');
      }
    } catch (error: any) {
      // react-native-share throws on cancel, which is fine
      if (error?.message !== 'User did not share') {
        console.error('Error sharing:', error);
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareEncrypted = async () => {
    setShowShareOptions(false);
    
    if (!password) {
      Alert.alert('Error', 'Password not available for encrypted export.');
      return;
    }
    
    setIsSharing(true);
    
    try {
      const tempPath = await exportAsEncryptedBundle(media.id, password);
      
      if (tempPath) {
        const fileUrl = Platform.OS === 'ios' ? tempPath : `file://${tempPath}`;
        await RNShare.open({
          url: fileUrl,
          filename: `${media.filename}.ppenc`,
          type: 'application/octet-stream',
          failOnCancel: false,
        });
        
        // Clean up after sharing
        await cleanupTempFiles();
      } else {
        Alert.alert('Error', 'Failed to create encrypted bundle.');
      }
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.error('Error sharing encrypted:', error);
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Secure Delete',
      'This will permanently erase this item with a secure overwrite. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: onDelete,
        },
      ],
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Decrypting...
          </Text>
        </View>
      );
    }

    if (!mediaUri) {
      return (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.text }]}>
            Failed to decrypt media
          </Text>
        </View>
      );
    }

    switch (media.type) {
      case 'photo':
        return (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.imageContainer}
            maximumZoomScale={5}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            <Image
              source={{ uri: mediaUri }}
              style={styles.image}
              resizeMode="contain"
            />
          </ScrollView>
        );

      case 'video':
        if (videoError || !VideoComponent) {
          return (
            <View style={styles.documentContainer}>
              <MaterialIcons name="videocam" size={64} color={colors.primary} />
              <Text style={[styles.documentName, { color: colors.text }]}>
                {media.filename}
              </Text>
              <Text style={[styles.documentInfo, { color: colors.textSecondary }]}>
                {formatFileSize(media.fileSize)}
              </Text>
              <TouchableOpacity
                style={[styles.openButton, { backgroundColor: colors.primary }]}
                onPress={handleShare}
              >
                <Text style={styles.openButtonText}>
                  Open in External App
                </Text>
              </TouchableOpacity>
            </View>
          );
        }

        // Try to play video with native player
        return (
          <TouchableOpacity
            style={styles.videoContainer}
            activeOpacity={1}
            onPress={() => setIsPaused(!isPaused)}
          >
            <VideoComponent
              source={{ uri: mediaUri }}
              style={styles.video}
              resizeMode="contain"
              controls={true}
              paused={isPaused}
              onError={(error: any) => {
                console.error('Video error:', error);
                setVideoError(true);
              }}
            />
          </TouchableOpacity>
        );

      case 'document':
        // For all documents (including PDFs), show info and share option
        // react-native-pdf has compatibility issues, so we use external apps
        return (
          <View style={styles.documentContainer}>
            <Text style={styles.documentIcon}>
              <MaterialIcons 
                name={media.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'description'} 
                size={64} 
                color={colors.primary} 
              />
            </Text>
            <Text style={[styles.documentName, { color: colors.text }]}>
              {media.filename}
            </Text>
            <Text style={[styles.documentInfo, { color: colors.textSecondary }]}>
              {formatFileSize(media.fileSize)}
            </Text>
            <TouchableOpacity
              style={[styles.openButton, { backgroundColor: colors.primary }]}
              onPress={handleShare}
            >
              <Text style={styles.openButtonText}>
                Open in External App
              </Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#000"
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Text style={[styles.headerButtonText, { color: colors.primary }]}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} /> Back
          </Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.headerButton}
            disabled={isSharing}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.headerButtonText, { color: colors.primary }]}>
                Share
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
            <Text style={[styles.headerButtonText, { color: '#ff4444' }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Footer Info */}
      <View style={[styles.footer, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
        <Text style={[styles.filename, { color: colors.text }]} numberOfLines={1}>
          {media.filename}
        </Text>
        <View style={styles.footerMeta}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {formatFileSize(media.fileSize)}
          </Text>
          <Text style={[styles.metaDot, { color: colors.textSecondary }]}>•</Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {formatDate(media.createdAt)}
          </Text>
        </View>
        <View style={styles.encryptionBadge}>
          <MaterialIcons name="lock" size={12} color={colors.textSecondary} />
          <Text style={[styles.encryptionText, { color: colors.textSecondary }]}>
            {isPasswordProtected ? 'Password protected • Encrypted' : 'End-to-end encrypted'}
          </Text>
        </View>
      </View>

      {/* Share Options Modal for Protected Files */}
      <Modal
        visible={showShareOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareOptions(false)}
      >
        <TouchableOpacity
          style={styles.shareModalOverlay}
          activeOpacity={1}
          onPress={() => setShowShareOptions(false)}
        >
          <View style={[styles.shareModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.shareModalTitle, { color: colors.text }]}>
              Share Options
            </Text>

            <TouchableOpacity
              style={[styles.shareOption, { borderBottomColor: colors.border }]}
              onPress={handleShareDecrypted}
            >
              <MaterialIcons name="share" size={24} color={colors.primary} style={styles.shareOptionIcon} />
              <View style={styles.shareOptionContent}>
                <Text style={[styles.shareOptionTitle, { color: colors.text }]}>
                  Share Decrypted
                </Text>
                <Text style={[styles.shareOptionDesc, { color: colors.textSecondary }]}>
                  Export as plain file
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareOption}
              onPress={handleShareEncrypted}
            >
              <MaterialIcons name="enhanced-encryption" size={24} color={colors.primary} style={styles.shareOptionIcon} />
              <View style={styles.shareOptionContent}>
                <Text style={[styles.shareOptionTitle, { color: colors.text }]}>
                  Share Encrypted (.ppenc)
                </Text>
                <Text style={[styles.shareOptionDesc, { color: colors.textSecondary }]}>
                  Recipient needs password to open
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareModalCancel, { backgroundColor: colors.border }]}
              onPress={() => setShowShareOptions(false)}
            >
              <Text style={[styles.shareModalCancelText, { color: colors.text }]}>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
  },
  pdf: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  documentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 40,
  },
  documentIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  documentName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  documentInfo: {
    fontSize: 14,
    marginTop: 8,
  },
  openButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  openButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  filename: {
    fontSize: 15,
    fontWeight: '500',
  },
  footerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
  },
  metaDot: {
    marginHorizontal: 6,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  encryptionIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  encryptionText: {
    fontSize: 12,
  },
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  shareModalContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  shareModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 16,
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  shareOptionIcon: {
    marginRight: 16,
  },
  shareOptionContent: {
    flex: 1,
  },
  shareOptionTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  shareOptionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  shareModalCancel: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MediaViewerScreen;

