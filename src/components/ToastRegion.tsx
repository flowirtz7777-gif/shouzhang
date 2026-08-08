export interface ToastRegionProps {
  messages: string[];
}

export function ToastRegion({ messages }: ToastRegionProps) {
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {messages.map((message, index) => (
        <div className="toast" key={`${message}-${index}`}>{message}</div>
      ))}
    </div>
  );
}
