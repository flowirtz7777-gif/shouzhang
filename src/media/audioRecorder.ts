export const MAX_RECORDING_MS = 15_000;
export const MICROPHONE_PERMISSION_ERROR = "无法使用麦克风，请检查浏览器权限";

export interface RecordingController {
  stop(): void;
  finished: Promise<Blob>;
}

export interface RecordingClock {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

const defaultClock: RecordingClock = {
  setTimeout: (handler, ms) => window.setTimeout(handler, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

export function assertRecordingDuration(ms: number): void {
  if (ms > MAX_RECORDING_MS) throw new Error("录音最长 15 秒");
}

export async function requestRecording(clock: RecordingClock = defaultClock): Promise<RecordingController> {
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const activeStream = stream;
    const recorder = new MediaRecorder(activeStream);
    const chunks: Blob[] = [];
    let stoppedAt = 0;

    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        clock.clearTimeout(stoppedAt);
        activeStream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      });
      recorder.addEventListener("error", () => {
        clock.clearTimeout(stoppedAt);
        activeStream.getTracks().forEach((track) => track.stop());
        reject(new Error("录音失败，请重试"));
      });
    });

    recorder.start();
    stoppedAt = clock.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, MAX_RECORDING_MS);

    return {
      stop() {
        if (recorder.state !== "inactive") recorder.stop();
      },
      finished,
    };
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    if (isPermissionError(error)) throw new Error(MICROPHONE_PERMISSION_ERROR, { cause: error });
    throw error;
  }
}

function isPermissionError(error: unknown): boolean {
  return error instanceof DOMException && ["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(error.name);
}
