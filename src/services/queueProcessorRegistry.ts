let processQueueCallback: (() => Promise<void>) | null = null;

export const queueProcessorRegistry = {
  registerQueueProcessor(cb: () => Promise<void>) {
    processQueueCallback = cb;
  },

  async triggerQueueProcessing() {
    if (processQueueCallback) {
      await processQueueCallback();
    }
  },
};

export default queueProcessorRegistry;
