/**
 * 把使用者選的圖片縮小並轉成可以送給 AI 供應商的格式。
 * 全程在瀏覽器裡用 canvas 處理：不用 <img>（CSP 的 img-src 只允許本站）、不上傳到本站、也不存到任何地方。
 */
export type PreparedImage = {
  /** 縮小後的畫面，可以直接放進頁面當預覽 */
  canvas: HTMLCanvasElement;
  mediaType: 'image/jpeg';
  base64: string;
  width: number;
  height: number;
  /** 送出的大小（位元組） */
  bytes: number;
};

/** 長邊上限：再大對辨識沒有幫助，只會多花 token。 */
export const MAX_EDGE = 1568;
/** 原始檔上限。 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class ImageError extends Error {}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // 分段轉，避免一次展開太大的陣列。
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** 依長邊上限算出縮小後的尺寸（不放大）。 */
export function fitWithin(width: number, height: number, maxEdge: number = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new ImageError('這不是圖片檔。請選擇命盤的截圖或照片（PNG、JPEG 等）。');
  if (file.size > MAX_FILE_BYTES) throw new ImageError('圖片超過 20 MB。請先裁切或縮小後再試。');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError('這張圖片打不開，可能是瀏覽器不支援的格式。請改用 PNG 或 JPEG。');
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageError('這個瀏覽器無法處理圖片。');
  // 透明背景先鋪白，轉成 JPEG 才不會變黑。
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new ImageError('圖片轉換失敗，請換一張圖再試。');
  return { canvas, mediaType: 'image/jpeg', base64: toBase64(await blob.arrayBuffer()), width, height, bytes: blob.size };
}
