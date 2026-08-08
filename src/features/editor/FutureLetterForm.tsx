import { LockKeyhole, Mic, ShieldAlert, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FutureLetter, PracticeAsset } from "../../domain/practice";
import {
  MICROPHONE_PERMISSION_ERROR,
  requestRecording as defaultRequestRecording,
  type RecordingController,
} from "../../media/audioRecorder";
import { createEditorUuid, type AssetBlobHandler } from "./imageUpload";

export type FutureLetterRecordingRequester = () => Promise<RecordingController | Blob>;

export interface FutureLetterFormProps {
  value?: FutureLetter;
  onChange(value?: FutureLetter): void;
  requestRecording?: FutureLetterRecordingRequester;
  onAudioReady?: AssetBlobHandler;
}

function getDateTime(value?: FutureLetter): string {
  return value?.unlockAt.slice(0, 16) ?? "";
}

function getOffset(value?: FutureLetter): string {
  return value?.unlockAt.match(/([+-]\d{2}:\d{2})$/)?.[1] ?? "+08:00";
}

function buildUnlockAt(dateTime: string, offset: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateTime)) return undefined;
  return `${dateTime}:00${offset}`;
}

function microphoneErrorMessage(error: unknown): string {
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(error.name)
  ) {
    return MICROPHONE_PERMISSION_ERROR;
  }
  if (error instanceof Error && error.message === MICROPHONE_PERMISSION_ERROR) {
    return MICROPHONE_PERMISSION_ERROR;
  }
  return error instanceof Error ? error.message : "录音失败，请重试";
}

export function FutureLetterForm({
  value,
  onChange,
  requestRecording = defaultRequestRecording,
  onAudioReady,
}: FutureLetterFormProps) {
  const [dateTime, setDateTime] = useState(() => getDateTime(value));
  const [offset, setOffset] = useState(() => getOffset(value));
  const [message, setMessage] = useState(value?.message ?? "");
  const [audioAssetId, setAudioAssetId] = useState(value?.audioAssetId);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<RecordingController | undefined>(undefined);

  useEffect(
    () => () => {
      controllerRef.current?.stop();
    },
    [],
  );

  function emit(nextDateTime: string, nextOffset: string, nextMessage: string, nextAudioId?: string) {
    const unlockAt = buildUnlockAt(nextDateTime, nextOffset);
    if (!unlockAt) return;
    const next: FutureLetter = { unlockAt, message: nextMessage };
    if (nextAudioId) next.audioAssetId = nextAudioId;
    onChange(next);
  }

  async function finishRecording(blob: Blob) {
    const id = createEditorUuid();
    const mimeType = blob.type || "audio/webm";
    const asset: PracticeAsset = {
      id,
      kind: "audio",
      mimeType,
      originalName: "future-letter-recording.webm",
      durationSeconds: 15,
      variants: {
        audio: { byteSize: blob.size, mimeType },
      },
    };
    try {
      if (onAudioReady) {
        await onAudioReady(asset, new Map([[`${id}:audio`, blob]]));
      }
      setAudioAssetId(id);
      emit(dateTime, offset, message, id);
      setError("");
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : "录音保存失败，请重试");
    } finally {
      controllerRef.current = undefined;
      setRecording(false);
    }
  }

  async function startRecording() {
    setError("");
    try {
      const result = await requestRecording();
      if (result instanceof Blob) {
        await finishRecording(result);
        return;
      }
      controllerRef.current = result;
      setRecording(true);
      void result.finished.then(finishRecording).catch((recordingError: unknown) => {
        setError(microphoneErrorMessage(recordingError));
        controllerRef.current = undefined;
        setRecording(false);
      });
    } catch (recordingError) {
      setError(microphoneErrorMessage(recordingError));
      setRecording(false);
    }
  }

  function stopRecording() {
    controllerRef.current?.stop();
  }

  return (
    <section className="editor-form" aria-labelledby="future-letter-title">
      <div className="editor-section-heading">
        <div>
          <span>TIME CAPSULE</span>
          <h3 id="future-letter-title">致未来的自己</h3>
        </div>
        <p>把一段话和 15 秒声音留在手账的最后一页。</p>
      </div>

      <div className="editor-privacy-note">
        <ShieldAlert aria-hidden="true" size={19} />
        <p>公开静态站点中的内容并不保密，请勿填写敏感信息</p>
      </div>

      <div className="editor-field-grid editor-field-grid--datetime">
        <label className="editor-field">
          <span>解锁日期与时间</span>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(event) => {
              const next = event.target.value;
              setDateTime(next);
              emit(next, offset, message, audioAssetId);
            }}
          />
        </label>
        <label className="editor-field">
          <span>时区偏移</span>
          <select
            aria-label="时区偏移"
            value={offset}
            onChange={(event) => {
              const next = event.target.value;
              setOffset(next);
              emit(dateTime, next, message, audioAssetId);
            }}
          >
            <option value="+08:00">+08:00</option>
            <option value="+09:00">+09:00</option>
            <option value="+00:00">+00:00</option>
            <option value="-05:00">-05:00</option>
          </select>
        </label>
      </div>

      <label className="editor-field">
        <span>信件内容</span>
        <textarea
          rows={7}
          value={message}
          onChange={(event) => {
            const next = event.target.value;
            setMessage(next);
            emit(dateTime, offset, next, audioAssetId);
          }}
          placeholder="等旅程结束后，写下最想提醒未来自己的话。"
        />
      </label>

      <div className="editor-recording-panel">
        <div className="editor-recording-panel__icon">
          {recording ? <Mic aria-hidden="true" size={20} /> : <LockKeyhole aria-hidden="true" size={20} />}
        </div>
        <div>
          <strong>{recording ? "正在录音" : audioAssetId ? "已保存一段录音" : "可选语音"}</strong>
          <span>{recording ? "最长 15 秒，也可以提前停止" : "录音会随公开发布包一起保存"}</span>
        </div>
        {recording ? (
          <button type="button" className="editor-record-button is-recording" onClick={stopRecording} aria-label="停止录音" title="停止录音">
            <Square aria-hidden="true" size={15} fill="currentColor" />
          </button>
        ) : (
          <button type="button" className="editor-record-button" onClick={() => void startRecording()} aria-label="开始录音" title="开始录音">
            <Mic aria-hidden="true" size={17} />
          </button>
        )}
      </div>

      {audioAssetId && !recording ? (
        <button
          type="button"
          className="editor-text-danger"
          onClick={() => {
            setAudioAssetId(undefined);
            emit(dateTime, offset, message);
          }}
        >
          <Trash2 aria-hidden="true" size={15} />
          移除录音
        </button>
      ) : null}
      {error ? <p className="editor-error" role="alert">{error}</p> : null}
      {!value ? <p className="editor-help">填写完整解锁时间和文字后，未来信箱就会出现在手账末页。</p> : null}
    </section>
  );
}
