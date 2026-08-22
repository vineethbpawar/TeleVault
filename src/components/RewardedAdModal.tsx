import React, { useEffect } from 'react';

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
}) => {
  useEffect(() => {
    if (visible) {
      onRewardEarned();
      onClose();
    }
  }, [visible, onRewardEarned, onClose]);

  return null;
};

export default RewardedAdModal;
