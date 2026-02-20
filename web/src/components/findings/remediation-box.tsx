export function RemediationBox({ text }: { text: string }) {
  return (
    <div className="mt-3 bg-rem/5 border border-rem/15 px-4 py-3">
      <span className="text-xs text-rem/50 font-medium tracking-wider block mb-1.5">
        REMEDIATION
      </span>
      <p className="text-sm text-muted-foreground leading-relaxed text-justify">
        {text}
      </p>
    </div>
  );
}
