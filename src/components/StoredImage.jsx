import { useEffect, useState } from "react";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";

/** Shows a photo saved in storage by its path (inspections keep paths, not links). */
export default function StoredImage({ path, alt, className = "" }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    if (path) getDownloadURL(ref(storage, path)).then((u) => live && setUrl(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  if (!url || url.startsWith("data:text")) {
    return <div className={`bg-slate-200 text-slate-600 text-xs flex items-center justify-center ${className}`}>Photo</div>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={alt} className={`object-cover ${className}`} loading="lazy" />
    </a>
  );
}
