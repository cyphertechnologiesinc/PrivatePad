import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  StatusBar,
  Dimensions,
  Text,
  Animated,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SplashScreen: React.FC = () => {
  const loadingWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate the loading bar
    Animated.loop(
      Animated.sequence([
        Animated.timing(loadingWidth, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(loadingWidth, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [loadingWidth]);

  const animatedWidth = loadingWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      <View style={styles.content}>
        {/* Logo */}
        <Image
          source={require('../assets/nobgprivatepad.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        
        {/* App Name */}
        <Text style={styles.appName}>PrivatePad</Text>
        
        {/* Loading indicator */}
        <View style={styles.loadingContainer}>
          <View style={styles.loadingBar}>
            <Animated.View 
              style={[
                styles.loadingProgress,
                { width: animatedWidth }
              ]} 
            />
          </View>
        </View>
      </View>
      
      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>by</Text>
        <Text style={styles.crypticText}>CRYPTIC</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: SCREEN_WIDTH * 0.55,
    height: SCREEN_WIDTH * 0.55,
    marginBottom: 24,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1,
    marginBottom: 48,
  },
  loadingContainer: {
    width: 120,
    alignItems: 'center',
  },
  loadingBar: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loadingProgress: {
    height: '100%',
    backgroundColor: '#F5A862',
    borderRadius: 2,
  },
  footer: {
    paddingBottom: 48,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 4,
  },
  crypticText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5A862',
    letterSpacing: 3,
  },
});

export default SplashScreen;
