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
    <Card className="mx-auto w-full max-w-2xl rounded-lg border-border bg-card">
      <CardHeader className="gap-3">
        <CardTitle className="text-xl font-semibold leading-tight">
          {heading}
        </CardTitle>
        <CardDescription className="text-base leading-6">
          {subhead}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
