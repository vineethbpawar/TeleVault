export const activeControllers = new Map<string, AbortController>();
export const activeNativeTasks = new Map<string, any>();

export const activeUploadRegistry = {
  activeControllers,
  activeNativeTasks,

  registerNativeUploadTask(itemId: string, task: any) {
    activeNativeTasks.set(itemId, task);
  },

  unregisterNativeUploadTask(itemId: string) {
    activeNativeTasks.delete(itemId);
  },

  registerAbortController(itemId: string, controller: AbortController) {
    activeControllers.set(itemId, controller);
  },

  unregisterAbortController(itemId: string) {
    activeControllers.delete(itemId);
  },

  abortUpload(itemId: string) {
    const controller = activeControllers.get(itemId);
    if (controller) {
      controller.abort();
      activeControllers.delete(itemId);
    }
  },
};

export default activeUploadRegistry;
