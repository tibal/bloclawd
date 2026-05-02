import { cn } from "@/lib/utils";

export function CodeBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded bg-muted p-4 font-mono text-sm tabular-nums whitespace-pre-wrap break-all",
        className,
      )}
    >
      <code>{children}</code>
    </pre>
  );
}
