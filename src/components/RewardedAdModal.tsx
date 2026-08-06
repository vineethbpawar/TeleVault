import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Gift, CheckCircle, Play, X } from 'lucide-react-native';
import { showToast } from './ToastBanner';
import AdBanner from './AdBanner';

interface RewardedAdModalProps {
  visible: boolean;
  onClose: () => void;
  onRewardEarned: () => void;
  rewardTitle?: string;
  rewardDescription?: string;
}

export const RewardedAdModal: React.FC<RewardedAdModalProps> = ({
  visible,
  onClose,
  onRewardEarned,
  rewardTitle = 'Unlock Premium Feature',
  rewardDescription = 'Watch a short 5-second video sponsor to unlock premium speed & exports for free!',
}) => {
  const [adState, setAdState] = useState<'idle' | 'watching' | 'completed'>('idle');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (visible) {
      setAdState('idle');
      setCountdown(5);
    }
  }, [visible]);

  useEffect(() => {
    let timer: any = null;
    if (adState === 'watching' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (adState === 'watching' && countdown === 0) {
      setAdState('completed');
      showToast('🎉 Reward Earned! Premium Feature Unlocked.');
      onRewardEarned();
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [adState, countdown]);

  const handleStartWatch = () => {
    setAdState('watching');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={adState === 'watching'}>
            <X size={20} color="#8E8E93" />
          </TouchableOpacity>

          {adState === 'idle' && (
            <View style={styles.centerBox}>
              <View style={styles.iconCircle}>
                <Gift size={36} color="#FFFC00" />
              </View>
              <Text style={styles.title}>{rewardTitle}</Text>
              <Text style={styles.desc}>{rewardDescription}</Text>

              <TouchableOpacity style={styles.watchBtn} onPress={handleStartWatch}>
                <Play size={18} color="#000000" fill="#000000" style={{ marginRight: 8 }} />
                <Text style={styles.watchBtnText}>Watch Sponsor Video</Text>
              </TouchableOpacity>
            </View>
          )}

          {adState === 'watching' && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#FFFC00" style={{ marginBottom: 12 }} />
              <Text style={styles.watchingTitle}>Sponsor Ad Playing…</Text>
              <Text style={styles.timerText}>{countdown}s</Text>
              
              {/* Live Web AdSense / Mobile Banner Container */}
              <View style={styles.adBannerBox}>
                <AdBanner />
              </View>

              <Text style={styles.subHint}>Please wait for reward confirmation</Text>
            </View>
          )}

          {adState === 'completed' && (
            <View style={styles.centerBox}>
              <CheckCircle size={44} color="#30D158" style={{ marginBottom: 12 }} />
              <Text style={styles.title}>Reward Unlocked!</Text>
              <Text style={styles.desc}>You have successfully unlocked your feature.</Text>

              <TouchableOpacity style={styles.claimBtn} onPress={onClose}>
                <Text style={styles.claimBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0F1123',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#FFFC00',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 252, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  watchBtn: {
    backgroundColor: '#FFFC00',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  watchBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  watchingTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  timerText: {
    color: '#FFFC00',
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 8,
  },
  adBannerBox: {
    width: '100%',
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  subHint: {
    color: '#8E8E93',
    fontSize: 12,
  },
  claimBtn: {
    backgroundColor: '#30D158',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  claimBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default RewardedAdModal;
