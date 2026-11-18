// Shrinks a phone photo before upload so inspections don't eat the driver's
// data plan: ~1600px JPEG (about 200-400 KB instead of 3-6 MB).
const DEMO = import.meta.env.MODE === "demo";
const MAX = DEMO ? 640 : 1600;
const QUALITY = DEMO ? 0.6 : 0.8;

export async function compressImage(file) {
  if (!file || !file.type?.startsWith("image/")) return file;
  if (file.size < 600000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}
