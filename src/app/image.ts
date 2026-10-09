import { LIMITS } from '../domain/types';

/** 縮小後の画像の形式と画質（4-8） */
export const IMAGE_TYPE = 'image/jpeg';
const IMAGE_QUALITY = 0.85;

/** 縦横比を保って長辺を maxSide 以下に収めた大きさ。元が小さければそのまま（拡大しない） */
export function fitSize(width: number, height: number, maxSide: number = LIMITS.imageMaxSide): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxSide) return { width, height };
  const scale = maxSide / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export class ImageLoadError extends Error {
  constructor() {
    super('画像を読み込めませんでした');
    this.name = 'ImageLoadError';
  }
}

/**
 * 選んだ画像ファイルを、長辺 1280px 以下の JPEG に縮小してバイト列で返す（4-8、7-4）。
 * iPhone の写真（HEIC）も Safari の <img> で読めるので、そのまま canvas に描いて JPEG にする。
 * 透過のある画像は白で塗った上に描く（JPEG は透過を持てないため）。
 */
export async function resizeImage(file: Blob): Promise<{ data: ArrayBuffer; type: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new ImageLoadError();
    }
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight);
    if (width === 0 || height === 0) throw new ImageLoadError();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageLoadError();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, IMAGE_TYPE, IMAGE_QUALITY));
    if (!blob) throw new ImageLoadError();
    return { data: await blob.arrayBuffer(), type: IMAGE_TYPE };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 画像を学習画面に出すか（6-4）。画像は付けた側の文字と一緒に出す。
 * shownSides はいま画面に出ている面（フラッシュカードの表面は表だけ、裏面は表と裏の両方。
 * タイプ入力は出題の面、判定後は両方）
 */
export function imageVisible(side: 'front' | 'back', shownSides: { front: boolean; back: boolean }): boolean {
  return side === 'front' ? shownSides.front : shownSides.back;
}
