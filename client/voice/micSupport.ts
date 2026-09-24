// CAN THIS PAGE RECORD AT ALL? — the one question about the microphone that a
// first paint asks. Its own module (3.28) because Today's capture line asks it
// before it offers the mic, on the phone's first screen, and the recorder
// beside it (./recorder.ts: MediaRecorder, the meter, the shared voice rules)
// is the capture sheet's lazy chunk, not the home screen's.

export type MicProblem = "insecure" | "unsupported" | "denied" | "nomic" | "failed";

/** `navigator.mediaDevices` does not EXIST on an insecure origin (a home
 *  server reached as http://192.168…), which is worth saying as that rather
 *  than as "no microphone". */
export function micSupport(): MicProblem | null {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return "unsupported";
  return null;
}
