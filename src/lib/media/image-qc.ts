/**
 * Control de calidad en el dispositivo antes de guardar o enviar al servidor (Sección 12):
 * - Tamaño mínimo
 * - Exposición / iluminación suficiente (ni muy oscura ni quemada)
 * - Nitidez mediante varianza del operador Laplaciano sobre luminancia
 * - Compresión a JPEG con lado mayor <= 1.600 px
 */

export interface ImageQualityReport {
  accepted: boolean;
  reason: string | null;
  width: number;
  height: number;
  meanLuminance: number;
  sharpnessScore: number;
  compressedDataUrl?: string;
  compressedSizeBytes?: number;
}

const MIN_SHORT_SIDE_PX = 480;
const MIN_LUMINANCE = 45;
const MAX_LUMINANCE = 225;
const MIN_LAPLACIAN_VARIANCE = 65;
const MAX_LONG_SIDE_PX = 1600;

export async function inspectAndCompressDatasheetImage(
  file: File
): Promise<ImageQualityReport> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    return {
      accepted: false,
      reason: "Formato no permitido. Usa una foto JPEG, PNG o WebP.",
      width: 0,
      height: 0,
      meanLuminance: 0,
      sharpnessScore: 0,
    };
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const shortSide = Math.min(width, height);

  if (shortSide < MIN_SHORT_SIDE_PX) {
    bitmap.close();
    return {
      accepted: false,
      reason: `La resolución es muy baja (${width}×${height} px): acércate a la placa técnica e intenta de nuevo.`,
      width,
      height,
      meanLuminance: 0,
      sharpnessScore: 0,
    };
  }

  // Analizar calidad sobre muestra reducida (máx 400 px lado mayor)
  const analysisScale = Math.min(1, 400 / Math.max(width, height));
  const aw = Math.max(32, Math.round(width * analysisScale));
  const ah = Math.max(32, Math.round(height * analysisScale));

  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = aw;
  analysisCanvas.height = ah;
  const actx = analysisCanvas.getContext("2d");
  if (!actx) {
    bitmap.close();
    throw new Error("No se pudo inicializar el contexto 2D del navegador.");
  }

  actx.drawImage(bitmap, 0, 0, aw, ah);
  const { data } = actx.getImageData(0, 0, aw, ah);

  const gray = new Float32Array(aw * ah);
  let lumSum = 0;
  for (let i = 0; i < aw * ah; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    lumSum += y;
  }
  const meanLuminance = lumSum / (aw * ah);

  if (meanLuminance < MIN_LUMINANCE) {
    bitmap.close();
    return {
      accepted: false,
      reason: "La foto está muy oscura: busca mejor luz o enciende la linterna y toma otra foto.",
      width,
      height,
      meanLuminance,
      sharpnessScore: 0,
    };
  }

  if (meanLuminance > MAX_LUMINANCE) {
    bitmap.close();
    return {
      accepted: false,
      reason: "La foto está quemada por exceso de luz o reflejo: evita el brillo directo sobre la placa.",
      width,
      height,
      meanLuminance,
      sharpnessScore: 0,
    };
  }

  // Varianza del Laplaciano 3x3 ([0,1,0; 1,-4,1; 0,1,0])
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < ah - 1; y++) {
    for (let x = 1; x < aw - 1; x++) {
      const idx = y * aw + x;
      const lap =
        gray[idx - aw]! +
        gray[idx - 1]! +
        gray[idx + 1]! +
        gray[idx + aw]! -
        4 * gray[idx]!;
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }
  const meanLap = count > 0 ? lapSum / count : 0;
  const sharpnessScore =
    count > 0 ? lapSqSum / count - meanLap * meanLap : 0;

  if (sharpnessScore < MIN_LAPLACIAN_VARIANCE) {
    bitmap.close();
    return {
      accepted: false,
      reason: "La foto está borrosa: apoya el celular y enfoca la placa.",
      width,
      height,
      meanLuminance,
      sharpnessScore,
    };
  }

  // Comprimir lado mayor <= 1.600 px a JPEG
  const outScale = Math.min(1, MAX_LONG_SIDE_PX / Math.max(width, height));
  const ow = Math.round(width * outScale);
  const oh = Math.round(height * outScale);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = ow;
  outCanvas.height = oh;
  const octx = outCanvas.getContext("2d");
  if (!octx) {
    bitmap.close();
    throw new Error("No se pudo comprimir la imagen en el navegador.");
  }

  octx.drawImage(bitmap, 0, 0, ow, oh);
  bitmap.close();

  const compressedDataUrl = outCanvas.toDataURL("image/jpeg", 0.85);
  const approxBytes = Math.round(((compressedDataUrl.length - 23) * 3) / 4);

  return {
    accepted: true,
    reason: null,
    width: ow,
    height: oh,
    meanLuminance,
    sharpnessScore,
    compressedDataUrl,
    compressedSizeBytes: approxBytes,
  };
}
