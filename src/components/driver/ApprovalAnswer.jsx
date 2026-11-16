import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";

/** The dispatcher's answer to "Ask dispatch": a full-screen message, read aloud. */
export default function ApprovalAnswer({ uid }) {
  const [answer, setAnswer] = useState(null);
  const [pending, setPending] = useState(false);
  const spoken = useRef(null);

  useEffect(
    () =>
      onSnapshot(query(collection(db, "approval_requests"), where("uid", "==", uid)), (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPending(docs.some((d) => d.status === "pending"));
        const fresh = docs
          .filter((d) => d.status !== "pending" && Date.now() - (d.decidedAtMs || 0) < 15 * 60000)
          .sort((a, b) => (b.decidedAtMs || 0) - (a.decidedAtMs || 0))[0];
        setAnswer(fresh || null);
      }),
    [uid]
  );

  const text = answer
    ? answer.status === "approved"
      ? `Dispatch OK'd you. You're at the back of the ${answer.zoneLabel} line.`
      : `Dispatch said no. ${answer.reason || ""}`
    : "";
  useEffect(() => {
    if (!answer || spoken.current === answer.id) return;
    spoken.current = answer.id;
    try {
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text));
    } catch {
      // No speech on this phone: the screen still shows it.
    }
  }, [answer, text]);

  function dismiss() {
    setAnswer(null);
  }

  if (answer) {
    const ok = answer.status === "approved";
    return (
      <div className={`fixed inset-0 z-[90] flex flex-col items-center justify-center p-6 text-center ${ok ? "bg-emerald-600" : "bg-red-700"}`} role="alertdialog" aria-live="assertive" data-testid="approval-answer">
        <p className="text-4xl font-display font-extrabold text-white">{ok ? "Approved" : "Not approved"}</p>
        <p className="mt-4 text-2xl font-semibold text-white">{text}</p>
        {ok && <p className="mt-2 text-lg text-white/90">Good for about an hour, then the normal checks apply again.</p>}
        <p className="mt-2 text-sm text-white/80">{answer.decidedBy ? `Answered by ${answer.decidedBy}` : ""}</p>
        <button type="button" onClick={dismiss} className="mt-8 min-h-[60px] min-w-[200px] rounded-2xl bg-white text-navy-950 font-extrabold text-xl" data-testid="approval-dismiss">
          Got it
        </button>
      </div>
    );
  }
  return pending ? (
    <div data-testid="approval-answer" className="p-3 bg-amber-500/20 text-amber-200 rounded-xl font-semibold text-center">
      Waiting for dispatch to answer&hellip;
    </div>
  ) : null;
}
