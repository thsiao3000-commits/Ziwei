import { create } from 'zustand';

/** AI 是否正在回覆。更新提示用它避免在回覆途中重新載入頁面。 */
export const useBusy = create<{ streaming: boolean; setStreaming: (streaming: boolean) => void }>()((set) => ({
  streaming: false,
  setStreaming: (streaming) => set({ streaming }),
}));
