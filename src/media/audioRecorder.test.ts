import { assertRecordingDuration, requestRecording } from "./audioRecorder";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

function mockMicrophone(stream: MediaStream) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
}

test("accepts a recording of exactly 15 seconds", () => {
  expect(() => assertRecordingDuration(15_000)).not.toThrow();
});

test("rejects a recording longer than 15 seconds", () => {
  expect(() => assertRecordingDuration(15_001)).toThrow("录音最长 15 秒");
});

test("stops microphone tracks when MediaRecorder construction fails", async () => {
  const stop = vi.fn();
  vi.stubGlobal("MediaRecorder", class {
    constructor() {
      throw new Error("unsupported recorder");
    }
  });
  mockMicrophone({
    getTracks: () => [{ stop }],
  } as unknown as MediaStream);

  await expect(requestRecording()).rejects.toThrow("unsupported recorder");
  expect(stop).toHaveBeenCalledOnce();
});

test("stops microphone tracks when MediaRecorder start fails", async () => {
  const stop = vi.fn();
  vi.stubGlobal("MediaRecorder", class {
    state: RecordingState = "inactive";
    mimeType = "audio/webm";
    addEventListener() {}
    start() {
      throw new Error("start failed");
    }
  });
  mockMicrophone({
    getTracks: () => [{ stop }],
  } as unknown as MediaStream);

  await expect(requestRecording()).rejects.toThrow("start failed");
  expect(stop).toHaveBeenCalledOnce();
});
