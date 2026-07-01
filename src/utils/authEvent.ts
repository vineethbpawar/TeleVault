type Listener = () => void;
const listeners = new Set<Listener>();

export const authEvents = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit() {
    listeners.forEach((l) => {
      try {
        l();
      } catch (err) {
        console.error('Error in authEvent listener:', err);
      }
    });
  },
};
