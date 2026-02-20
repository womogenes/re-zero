/**
 * Centered loading state with rem-running.gif and a message.
 * Defaults to full viewport height minus header; pass `className` to override container styles.
 */
export function LoadingState({
  message,
  subMessage,
  className = "flex items-center justify-center h-[calc(100vh-8rem)]",
  gifSize = "w-16 h-16",
}: {
  message: string;
  subMessage?: string;
  className?: string;
  gifSize?: string;
}) {
  return (
    <div className={className}>
      <div className="text-center">
        <img
          src="/rem-running.gif"
          alt="rem"
          className={`${gifSize} mx-auto mb-3 object-contain`}
        />
        <p className="text-sm text-muted-foreground">{message}</p>
        {subMessage && (
          <p className="text-xs text-muted-foreground mt-1">{subMessage}</p>
        )}
      </div>
    </div>
  );
}
