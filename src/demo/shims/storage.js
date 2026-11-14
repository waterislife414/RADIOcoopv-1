// Demo stand-in for "firebase/storage": uploads stay in the browser.
const KEY = "rc-demo-files-v1";
const mem = {};
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};
export const getStorage = () => ({ type: "demo-storage" });
export const ref = (_storage, path) => ({ fullPath: path, name: String(path).split("/").pop() });
export async function uploadBytes(r, file) {
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(null);
    fr.readAsDataURL(file);
  });
  mem[r.fullPath] = dataUrl;
  // Small files are shared with other tabs; big ones stay in this tab only.
  if (dataUrl && dataUrl.length < 400_000) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [r.fullPath]: dataUrl }));
    } catch {
      /* storage full: keep in memory */
    }
  }
  return { ref: r };
}
export async function getDownloadURL(r) {
  return mem[r.fullPath] || read()[r.fullPath] || "data:text/plain,Example%20file%20(demo)";
}
