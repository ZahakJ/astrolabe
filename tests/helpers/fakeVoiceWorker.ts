// A stand-in for server/voiceWorker.ts that speaks its protocol without a
// model (tests/voiceEngine.test.ts). The parent's fallback is what is under
// test, so the GPU here is always a GPU that fails:
//
//   probe            → the GPU build named by FAKE_VOICE_PROBE (default vulkan)
//   job, engine gpu  → "gpu-unavailable", or with FAKE_VOICE_GPU=crash the
//                      child dies mid-job, as a driver fault would take it
//   job, engine cpu  → with FAKE_VOICE_CPU=missing, "cpu-unavailable" (sherpa-onnx
//                      did not load), and the parent must fall to the floor
//   job, otherwise   → words that say which engine, model and thread count
//                      the parent sent, heard "on" the processor

interface Message {
  id: string;
  kind: "probe" | "job";
  engine?: string;
  onnx?: { size: string };
  threads?: number;
}

process.on("message", (m: Message) => {
  if (m.kind === "probe") {
    process.send?.({ id: m.id, backend: process.env.FAKE_VOICE_PROBE ?? "vulkan" });
    return;
  }
  if (m.engine === "gpu") {
    if (process.env.FAKE_VOICE_GPU === "crash") process.exit(3);
    process.send?.({ id: m.id, error: "The vulkan build found no GPU", code: "gpu-unavailable" });
    return;
  }
  if (m.engine === "cpu" && process.env.FAKE_VOICE_CPU === "missing") {
    process.send?.({ id: m.id, error: "sherpa-onnx does not load here", code: "cpu-unavailable" });
    return;
  }
  process.send?.({ id: m.id, text: `${m.engine} ${m.onnx?.size} ${m.threads}`, language: "en", backend: "cpu" });
});

process.on("disconnect", () => process.exit(0));
