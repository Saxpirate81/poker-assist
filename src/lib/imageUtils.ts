/** Resize/compress phone photos before sending to vision APIs (avoids 413 / payload errors). */
export async function compressImageForAi(
  file: File,
  opts?: { maxDim?: number; quality?: number }
): Promise<string> {
  const maxDim = opts?.maxDim ?? 1600
  const quality = opts?.quality ?? 0.82
  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  return canvas.toDataURL('image/jpeg', quality)
}
