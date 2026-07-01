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

  // Scale dimensions based on size
  const vaultRadius = logoSize * 0.22;
  const vaultBorderWidth = Math.max(1.5, logoSize * 0.05);
  const dialSize = logoSize * 0.5;
  const dialBorderWidth = Math.max(1, logoSize * 0.035);
  const tBarWidth = logoSize * 0.38;
  const tBarHeight = Math.max(2, logoSize * 0.07);
  const tStemWidth = Math.max(2, logoSize * 0.07);
  const tStemHeight = logoSize * 0.4;
  const boltSize = Math.max(1.5, logoSize * 0.04);
  const boltOffset = logoSize * 0.12;

  // Layout calculations
  const tStemTop = (logoSize - tStemHeight) / 2 + (logoSize * 0.04);
  const tBarTop = tStemTop - tBarHeight + 1; // overlap by 1px to avoid gap

  return (
    <View style={[styles.outerContainer, style]}>
      <View
        style={[
          styles.vaultBox,
          {
            width: logoSize,
            height: logoSize,
            borderRadius: vaultRadius,
            borderWidth: vaultBorderWidth,
          },
        ]}
      >
        {/* Bolt dots in corners to look like a vault door */}
        <View style={[styles.bolt, { top: boltOffset, left: boltOffset, width: boltSize, height: boltSize, borderRadius: boltSize / 2 }]} />
        <View style={[styles.bolt, { top: boltOffset, right: boltOffset, width: boltSize, height: boltSize, borderRadius: boltSize / 2 }]} />
        <View style={[styles.bolt, { bottom: boltOffset, left: boltOffset, width: boltSize, height: boltSize, borderRadius: boltSize / 2 }]} />
        <View style={[styles.bolt, { bottom: boltOffset, right: boltOffset, width: boltSize, height: boltSize, borderRadius: boltSize / 2 }]} />

        {/* Circular Vault Dial (behind/integrated with T) */}
        <View
          style={[
            styles.dial,
            {
              width: dialSize,
              height: dialSize,
              borderRadius: dialSize / 2,
              borderWidth: dialBorderWidth,
            },
          ]}
        >
          {/* Small Dial Pointer inside */}
          <View style={[styles.dialPointer, { height: dialSize * 0.18, width: Math.max(1, dialSize * 0.06), top: 2 }]} />
        </View>

        {/* Letter T integrated inside vault */}
        {/* T horizontal bar */}
        <View
          style={[
            styles.tBar,
            {
              width: tBarWidth,
              height: tBarHeight,
              top: tBarTop,
              borderRadius: tBarHeight / 2,
            },
          ]}
        />
        {/* T vertical stem */}
        <View
          style={[
            styles.tStem,
            {
              width: tStemWidth,
              height: tStemHeight,
              top: tStemTop,
              borderRadius: tStemWidth / 2,
            },
          ]}
        />

        {/* Central dial lock handle dot */}
        <View
          style={[
            styles.dialCenter,
            {
              width: logoSize * 0.12,
              height: logoSize * 0.12,
              borderRadius: (logoSize * 0.12) / 2,
            },
          ]}
        />
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
    backgroundColor: '#0F1123', // Dark Navy
    borderColor: '#FFFC00', // Yellow/Gold
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bolt: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 252, 0, 0.45)',
  },
  dial: {
    borderColor: 'rgba(255, 252, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  dialPointer: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 252, 0, 0.45)',
    borderRadius: 1,
  },
  dialCenter: {
    position: 'absolute',
    backgroundColor: '#FFFC00',
    borderWidth: 1,
    borderColor: '#0F1123',
  },
  tBar: {
    position: 'absolute',
    backgroundColor: '#FFFC00',
    alignSelf: 'center',
  },
  tStem: {
    position: 'absolute',
    backgroundColor: '#FFFC00',
    alignSelf: 'center',
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
