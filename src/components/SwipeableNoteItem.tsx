import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
} from 'react-native';
import { Note } from '../types';
import { useTheme } from '../context/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = -80;
const DELETE_BUTTON_WIDTH = 80;

interface SwipeableNoteItemProps {
  note: Note;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
}

const SwipeableNoteItem: React.FC<SwipeableNoteItemProps> = ({
  note,
  isActive,
  onPress,
  onDelete,
}) => {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipedOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderGrant: () => {
        translateX.setOffset(isSwipedOpen.current ? -DELETE_BUTTON_WIDTH : 0);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Limit swipe to left only and cap at delete button width
        const newValue = Math.min(0, Math.max(-DELETE_BUTTON_WIDTH - 20, gestureState.dx));
        translateX.setValue(newValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateX.flattenOffset();

        if (gestureState.dx < SWIPE_THRESHOLD) {
          // Open delete button
          Animated.spring(translateX, {
            toValue: -DELETE_BUTTON_WIDTH,
            useNativeDriver: true,
            friction: 8,
          }).start();
          isSwipedOpen.current = true;
        } else {
          // Close
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
          }).start();
          isSwipedOpen.current = false;
        }
      },
    }),
  ).current;

  const handleDelete = () => {
    Alert.alert(
      'Delete Note',
      `Are you sure you want to delete "${note.title}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            // Close the swipe
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
            isSwipedOpen.current = false;
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Animate out then delete
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              onDelete();
            });
          },
        },
      ],
    );
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <View style={styles.container}>
      {/* Delete Button (behind the item) */}
      <View style={[styles.deleteButton, { backgroundColor: colors.danger }]}>
        <TouchableOpacity
          style={styles.deleteButtonInner}
          onPress={handleDelete}
          activeOpacity={0.8}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable Content */}
      <Animated.View
        style={[
          styles.noteItem,
          {
            backgroundColor: isActive ? colors.activeItem : colors.background,
            borderLeftColor: isActive ? colors.primary : 'transparent',
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}>
        <TouchableOpacity
          style={styles.noteItemTouchable}
          onPress={onPress}
          activeOpacity={0.7}>
          <View style={styles.noteItemContent}>
            <Text
              style={[styles.noteTitle, { color: colors.text }]}
              numberOfLines={1}>
              {note.title || 'Untitled'}
            </Text>
            <Text
              style={[styles.notePreview, { color: colors.textSecondary }]}
              numberOfLines={1}>
              {note.content || 'No content'}
            </Text>
          </View>
          <Text style={[styles.noteDate, { color: colors.textSecondary }]}>
            {formatDate(note.updatedAt)}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginVertical: 2,
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  deleteButtonInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  deleteButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  noteItem: {
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  noteItemTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  noteItemContent: {
    flex: 1,
    marginRight: 12,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  notePreview: {
    fontSize: 14,
  },
  noteDate: {
    fontSize: 12,
  },
});

export default SwipeableNoteItem;

