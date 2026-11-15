import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Clock, PlayCircle, CheckCircle, XCircle } from "lucide-react";

interface QueueStatsCardsProps {
  stats: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    error: number;
  };
}

export function QueueStatsCards({ stats }: QueueStatsCardsProps) {
  const cards = [
    {
      title: "Total Jobs",
      value: stats.total,
      icon: Clock,
      description: "All jobs in queue",
      color: "text-ds-muted",
    },
    {
      title: "Pending",
      value: stats.pending,
      icon: Clock,
      description: "Waiting to process",
      color: "text-ds-amber",
    },
    {
      title: "Processing",
      value: stats.processing,
      icon: PlayCircle,
      description: "Currently running",
      color: "text-ds-blue",
    },
    {
      title: "Completed",
      value: stats.completed,
      icon: CheckCircle,
      description: "Successfully finished",
      color: "text-ds-green",
    },
    {
      title: "Failed",
      value: stats.error,
      icon: XCircle,
      description: "Errors encountered",
      color: "text-ds-red",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
