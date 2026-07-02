import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

interface TeleVaultLogoProps {
  size?: number;
  showText?: boolean;
  variant?: 'icon' | 'full';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const TeleVaultLogo: React.FC<TeleVaultLogoProps> = ({
  size = 48,
  showText = false,
  variant = 'icon',
  style,
  textStyle,
}) => {
  const logoSize = size;
  const isFull = variant === 'full' || showText;

  const borderRadius = logoSize * 0.2;
  const borderWidth = Math.max(1.5, logoSize * 0.05);
  const innerPadding = logoSize * 0.12;

  return (
    <View style={[styles.outerContainer, style]}>
      <View
        style={[
          styles.vaultBox,
          {
            width: logoSize,
            height: logoSize,
            borderRadius: borderRadius,
            borderWidth: borderWidth,
            padding: innerPadding,
          },
        ]}
      >
        {/* Simple Dial Circle */}
        <View style={[styles.dialCircle, { borderWidth: Math.max(1, logoSize * 0.04) }]}>
          {/* Letter T inside dial */}
          <Text
            style={[
              styles.letterT,
              {
                fontSize: logoSize * 0.4,
                lineHeight: logoSize * 0.5,
              },
            ]}
          >
            T
          </Text>
        </View>
      </View>

      {isFull && (
        <View style={styles.textContainer}>
          <Text style={[styles.logoText, { fontSize: logoSize * 0.45 }, textStyle]}>
            Tele<Text style={styles.goldText}>Vault</Text>
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultBox: {
    backgroundColor: '#0B0E1B', // Dark Navy matching assets
    borderColor: '#FFFC00', // Yellow/Gold
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderColor: '#FFFC00',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 252, 0, 0.05)',
  },
  letterT: {
    color: '#FFFC00',
    fontWeight: '900',
    textAlign: 'center',
  },
  textContainer: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  goldText: {
    color: '#FFFC00',
  },
});

export default TeleVaultLogo;
