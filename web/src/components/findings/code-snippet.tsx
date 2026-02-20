/**
 * Code snippet with file header and line-numbered table.
 * Pass `location` in the format "path/to/file.ts:10-20" to parse automatically,
 * or pass `file` and `startLine` directly.
 */
export function CodeSnippet({
  code,
  location,
  file: fileProp,
  startLine: startLineProp,
}: {
  code: string;
  location?: string;
  file?: string;
  startLine?: number;
}) {
  const locMatch = location?.match(/^(.+?):(\d+)(?:-(\d+))?/);
  const file = fileProp ?? locMatch?.[1];
  const startLine = startLineProp ?? (locMatch ? parseInt(locMatch[2]) : 1);
  const lineRange = locMatch
    ? `L${locMatch[2]}${locMatch[3] ? `–${locMatch[3]}` : ""}`
    : null;

  const lines = code.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const gutterWidth = String(startLine + lines.length - 1).length;

  return (
    <div className="mt-3 border border-border overflow-hidden">
      {file && (
        <div className="px-3 py-1.5 bg-muted/80 border-b border-border flex items-baseline gap-3">
          <span className="text-xs text-muted-foreground font-mono">
            {file}
          </span>
          {lineRange && (
            <span className="text-xs text-muted-foreground/40 font-mono tabular-nums">
              {lineRange}
            </span>
          )}
        </div>
      )}
      <div className="bg-muted/40 overflow-x-auto">
        <table className="w-full text-xs leading-relaxed font-mono border-collapse">
          <tbody>
            {lines.map((line, j) => (
              <tr key={j} className="hover:bg-muted/60">
                <td
                  className="text-muted-foreground/30 text-right pr-3 pl-3 py-0 select-none whitespace-nowrap tabular-nums border-r border-border/50"
                  style={{ width: `${gutterWidth + 2}ch` }}
                >
                  {startLine + j}
                </td>
                <td className="text-foreground/70 pl-3 pr-4 py-0 whitespace-pre">
                  {line}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
