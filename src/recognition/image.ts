/**
 * Downscales and re-encodes the photo in the browser before upload: phone
 * photos are often > 5 MB (API limit) and much larger than the model needs.
 */

const MAX_LONG_SIDE = 2400;
const JPEG_QUALITY = 0.85;

export async function prepareImage(file: Blob): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  // Respect the EXIF orientation so the sheet is not sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Bild konnte nicht verarbeitet werden.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht verarbeitet werden.'))), 'image/jpeg', JPEG_QUALITY),
  );
  return { base64: await blobToBase64(blob), mediaType: 'image/jpeg' };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
