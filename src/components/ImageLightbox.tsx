/**
 * Full-screen image viewer with pinch-to-zoom, double-tap-to-zoom and pan.
 * Shared across Assets, Loans, Insurance and Expenses so the gesture experience
 * is identical everywhere. Mirrors the original Asset Detail implementation.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

export const ZoomableImage: React.FC<{ uri: string }> = ({ uri }) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }, animatedStyle]}>
        <Image
          source={{ uri }}
          style={styles.lightboxImage}
          contentFit="contain"
          contentPosition="center"
          priority="high"
        />
      </Animated.View>
    </GestureDetector>
  );
};

/**
 * Full-screen modal wrapping ZoomableImage. Render once per screen and control
 * via the `uri` prop (null = hidden).
 */
const ImageLightbox: React.FC<{
  uri: string | null;
  localPath?: string | null;
  onClose: () => void;
}> = ({ uri, localPath, onClose }) => {
  return (
    <Modal visible={!!uri} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightbox}>
        {uri ? <ZoomableImage uri={uri} /> : null}
        {uri && localPath ? (
          <View style={styles.pathPill}>
            <Text style={styles.pathText} numberOfLines={2}>
              Path: {localPath}
            </Text>
          </View>
        ) : null}
        <Pressable style={styles.lightboxClose} onPress={onClose}>
          <MaterialCommunityIcons name="close-circle" size={36} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  lightbox: { flex: 1, backgroundColor: '#000' },
  lightboxImage: { flex: 1, width: '100%' },
  lightboxClose: { position: 'absolute', top: 48, right: 16 },
  pathPill: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  pathText: { color: '#fff', fontSize: 11, textAlign: 'center' },
});

export default ImageLightbox;
