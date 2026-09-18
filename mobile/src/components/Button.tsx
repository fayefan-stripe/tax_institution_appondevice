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
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: Props) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.white : theme.primary} />
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
    minHeight: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: theme.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.primary,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
  },
  primaryLabel: {
    color: theme.white,
  },
  secondaryLabel: {
    color: theme.primary,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
  },
});
