// Zdieľaná komprimácia/rotácia obrázkov pred nahratím do AI scan flowov —
// pôvodne definované iba v app/ai-evidencia/page.tsx (generický Inbox
// scanner s manuálnou rotáciou), extrahované sem, aby rovnakú logiku mohol
// bezo zmeny správania použiť aj TP (technický preukaz) flow presunutý do
// app/vozidla/page.tsx (volá compressImage(file, 0, t) — bez rotácie,
// rovnako ako predtým v ai-evidencia). Čisté funkcie, žiadny React/stav.

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

export function normalizeRotation(value: number): number {
  return ((value % 360) + 360) % 360;
}

async function decodeImageWithOrientation(
  file: File,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Staršie prehliadače môžu createImageBitmap alebo jeho options odmietnuť.
    }
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t("inbox.errors.imageLoadFailed")));
      img.src = imageUrl;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(imageUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(imageUrl);
    throw error;
  }
}

export async function compressImage(
  file: File,
  rotation: number,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<File> {
  const decodedImage = await decodeImageWithOrientation(file, t);

  try {
    const normalizedRotation = normalizeRotation(rotation);
    const swapsDimensions =
      normalizedRotation === 90 || normalizedRotation === 270;
    const rotatedWidth = swapsDimensions
      ? decodedImage.height
      : decodedImage.width;
    const rotatedHeight = swapsDimensions
      ? decodedImage.width
      : decodedImage.height;
    const maxDimension = 1800;
    const scale = Math.min(
      1,
      maxDimension / Math.max(rotatedWidth, rotatedHeight)
    );
    const scaledSourceWidth = Math.max(
      1,
      Math.round(decodedImage.width * scale)
    );
    const scaledSourceHeight = Math.max(
      1,
      Math.round(decodedImage.height * scale)
    );
    const outputWidth = swapsDimensions
      ? scaledSourceHeight
      : scaledSourceWidth;
    const outputHeight = swapsDimensions
      ? scaledSourceWidth
      : scaledSourceHeight;

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(t("inbox.errors.imageCompressPrepFailed"));
    }

    if (normalizedRotation === 90) {
      context.translate(outputWidth, 0);
      context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
      context.translate(outputWidth, outputHeight);
      context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
      context.translate(0, outputHeight);
      context.rotate(-Math.PI / 2);
    }

    context.drawImage(
      decodedImage.source,
      0,
      0,
      scaledSourceWidth,
      scaledSourceHeight
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error(t("inbox.errors.imageCompressFailed")));
          }
        },
        "image/webp",
        0.8
      );
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("AI EVIDENCE IMAGE DEBUG", {
        originalWidth: decodedImage.width,
        originalHeight: decodedImage.height,
        outputWidth,
        outputHeight,
        rotation: normalizedRotation,
        outputMimeType: blob.type,
        outputSize: blob.size,
      });
    }

    const originalName =
      file.name.replace(/\.[^/.]+$/, "") || t("inbox.documentGenericFallback");

    return new File([blob], `${originalName}.webp`, {
      type: blob.type || "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    decodedImage.release();
  }
}
