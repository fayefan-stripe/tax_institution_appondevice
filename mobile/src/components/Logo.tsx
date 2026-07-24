import React from 'react';
import { Image, ImageStyle, StyleSheet } from 'react-native';

type Props = {
  small?: boolean;
  style?: ImageStyle;
};

export function Logo({ small, style }: Props) {
  return (
    <Image
      source={require('../assets/logo.png')}
      style={[styles.logo, small && styles.logoSmall, style]}
      resizeMode="contain"
      accessibilityLabel="Social Booth"
    />
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
