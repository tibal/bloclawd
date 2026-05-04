import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface EmptyStateProps {
  heading: string;
  subhead: string;
}

export function EmptyState({ heading, subhead }: EmptyStateProps) {
  return (
    <Card className="mx-auto w-full max-w-2xl rounded-lg border-border bg-card text-center">
      <CardHeader className="items-center gap-3 py-12">
        <img
          alt=""
          aria-hidden
          className="empty-state-mark"
          decoding="async"
          height={56}
          src="/logo.png"
          width={56}
        />
        <CardTitle className="text-xl font-semibold leading-tight">
          {heading}
        </CardTitle>
        <CardDescription className="max-w-md text-base leading-6">
          {subhead}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
