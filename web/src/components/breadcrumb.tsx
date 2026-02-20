import Link from "next/link";

type Segment =
  | { label: string; href: string }
  | { label: string };

export function Breadcrumb({ segments }: { segments: Segment[] }) {
  return (
    <div className="flex items-baseline gap-2">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-baseline gap-2">
          {i > 0 && (
            <span className="text-xs text-muted-foreground/30">/</span>
          )}
          {"href" in seg ? (
            <Link
              href={seg.href}
              className="text-sm text-muted-foreground hover:text-rem transition-colors duration-150"
            >
              {seg.label}
            </Link>
          ) : (
            <span className="text-sm font-semibold">{seg.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
