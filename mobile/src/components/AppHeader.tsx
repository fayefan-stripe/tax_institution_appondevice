import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { APP_TITLE } from '../config';
import { theme } from '../theme';

type Props = {
  subtitle?: string;
  compact?: boolean;
};

export function AppHeader({ subtitle, compact }: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.title, compact && styles.titleCompact]} accessibilityRole="header">
        {APP_TITLE}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  wrapCompact: {
    marginBottom: 0,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.navy,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.slate,
    textAlign: 'center',
  },
});
