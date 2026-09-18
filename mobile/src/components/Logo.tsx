import React from 'react';
import { Image, ImageStyle, Pressable, StyleSheet } from 'react-native';

type Props = {
  small?: boolean;
  style?: ImageStyle;
  onPress?: () => void;
};

export function Logo({ small, style, onPress }: Props) {
  const image = (
    <Image
      source={require('../assets/logo.png')}
      style={[styles.logo, small && styles.logoSmall, style]}
      resizeMode="contain"
      accessibilityLabel="Social Booth"
    />
  );

  if (!onPress) {
    return image;
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Social Booth">
      {image}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: '100%',
    maxWidth: 340,
    height: 120,
    transform: [{ rotate: '-6deg' }],
    marginBottom: 8,
  },
  logoSmall: {
    maxWidth: 240,
    height: 84,
    marginBottom: 0,
  },
});
