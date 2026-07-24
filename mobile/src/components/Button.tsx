import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { theme } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  level?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  level = false,
  style,
}: Props) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        level && styles.level,
        (disabled || loading) && styles.disabled,
        pressed && (level ? styles.pressedLevel : styles.pressed),
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.black : theme.pink} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    minHeight: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  level: {
    transform: [{ rotate: '0deg' }],
  },
  primary: {
    backgroundColor: theme.pink,
    shadowColor: theme.pink,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.pink,
  },
  label: {
    fontSize: 17,
    fontWeight: '800',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  primaryLabel: {
    color: theme.black,
  },
  secondaryLabel: {
    color: theme.pink,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
  },
  pressedLevel: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
