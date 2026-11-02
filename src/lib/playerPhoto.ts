import { PHOTO_MAX_CHARS } from "./teamHub";

/** A player picture is cropped square from the middle and kept this many pixels across. */
export const PHOTO_PX = 112;

export class PhotoError extends Error {}

/**
 * A head shot as a small square JPEG data URL, so it lives with the player
 * (in this browser, on the account, in a Front Office roster) and prints on
 * the depth chart without another download. Phones' HEIC pictures only open
 * where the browser can read them (Safari); everywhere else the coach is
 * asked for a JPG.
 */
export async function photoFromFile(file: File): Promise<string> {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) throw new PhotoError("Choose a picture: a JPG, PNG or WebP.");
  if (file.size > 15 * 1024 * 1024) throw new PhotoError("That picture is over 15 MB. Choose a smaller copy.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new PhotoError("That picture didn't open here. Save it as a JPG and try again."));
      i.src = url;
    });
    const w = img.naturalWidth || PHOTO_PX;
    const h = img.naturalHeight || PHOTO_PX;
    const side = Math.min(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_PX;
    canvas.height = PHOTO_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError("This browser can't shrink pictures. Try another browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PHOTO_PX, PHOTO_PX);
    // Faces sit in the top half of most team pictures, so the crop leans up.
    ctx.drawImage(img, (w - side) / 2, Math.max(0, (h - side) * 0.3), side, side, 0, 0, PHOTO_PX, PHOTO_PX);
    for (const q of [0.8, 0.65, 0.5, 0.35]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= PHOTO_MAX_CHARS) return data;
    }
    throw new PhotoError("That picture is too detailed to keep. Try a simpler one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "CC" for Casen Crawford: shown when a player has no picture. */
export const initials = (first: string, last: string) => `${first.trim()[0] ?? ""}${last.trim()[0] ?? ""}`.toUpperCase() || "?";
