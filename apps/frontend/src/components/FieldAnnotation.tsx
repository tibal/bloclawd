export function FieldAnnotation({
  field,
  meaning,
  anonymity,
}: {
  field: string;
  meaning: string;
  anonymity: string;
}) {
  return (
    <div className="border-l-2 border-primary py-2 pl-4">
      <div className="font-mono text-sm font-semibold">{field}</div>
      <div className="text-sm text-muted-foreground">{meaning}</div>
      <div className="mt-1 text-xs italic text-muted-foreground">
        {anonymity}
      </div>
    </div>
  );
}
