import React from 'react';
import { StyleSheet, View, Text, Switch, TouchableOpacity, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

interface SettingsRowProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  style?: ViewStyle;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  title,
  subtitle,
  icon,
  value,
  onValueChange,
  onPress,
  rightElement,
  style,
}) => {
  const isSwitch = onValueChange !== undefined;

  const renderRight = () => {
    if (rightElement) return rightElement;
    if (isSwitch) {
      return (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#1e2444', true: '#FFFC00' }}
          thumbColor={value ? '#FFFFFF' : '#8e92af'}
        />
      );
    }
    if (onPress) {
      return <ChevronRight size={18} color="#8e92af" />;
    }
    return null;
  };

  const Content = (
    <View style={[styles.row, style]}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      <View style={styles.rightContainer}>{renderRight()}</View>
    </View>
  );

  if (onPress && !isSwitch) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {Content}
      </TouchableOpacity>
    );
  }

  return Content;
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#0f1123',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2444',
  },
  iconContainer: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#8e92af',
    fontSize: 12,
    marginTop: 2,
  },
  rightContainer: {
    marginLeft: 12,
    justifyContent: 'center',
  },
});

export default SettingsRow;
