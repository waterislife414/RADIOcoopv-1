import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { useAuth } from "../context/AuthContext";

// Looks for a face in the picture where the phone's browser can do that
// (Chrome on Android). Returns true / false, or null when it can't tell.
async function hasFace(file) {
  if (!("FaceDetector" in window)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 }).detect(bitmap);
    return faces.length > 0;
  } catch {
    return null;
  }
}

/** Rider's profile picture. Must show their face so the driver can spot them. */
export default function ProfilePhoto() {
  const { currentUser, userProfile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const face = await hasFace(file);
      if (face === false) {
        setMsg("We couldn't see a face in that picture. Use a clear photo of your face, no sunglasses.");
        return;
      }
      const r = ref(storage, `profile_photos/${currentUser.uid}/photo_${Date.now()}`);
      await uploadBytes(r, file);
      const photoUrl = await getDownloadURL(r);
      await updateDoc(doc(db, "users", currentUser.uid), { photoUrl, photoCheck: face ? "face-found" : "needs-review" });
      await refreshProfile();
      setMsg(face ? "Looks good." : "Saved. Make sure it clearly shows your face; the office may ask for a new one.");
    } catch {
      setMsg("Could not save the photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5 flex items-center gap-4">
      <div className="h-20 w-20 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-3xl text-slate-400">
        {userProfile?.photoUrl ? <img src={userProfile.photoUrl} alt="Your profile" className="h-full w-full object-cover" /> : "\u{1F464}"}
      </div>
      <div className="flex-1">
        <p className="font-bold text-lg text-slate-800">Profile photo</p>
        <p className="text-sm text-slate-400">A clear picture of your face helps your driver find you.</p>
        <label className="inline-block mt-2 rounded-xl px-4 py-2 font-semibold bg-navy-950 text-white cursor-pointer">
          {busy ? "Saving…" : userProfile?.photoUrl ? "Change photo" : "Add photo"}
          <input type="file" accept="image/*" capture="user" className="hidden" disabled={busy} onChange={pick} />
        </label>
        {msg && <p className="text-sm text-slate-600 mt-2">{msg}</p>}
      </div>
    </div>
  );
}
