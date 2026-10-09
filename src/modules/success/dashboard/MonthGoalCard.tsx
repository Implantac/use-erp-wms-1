import { Target, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/ui/base/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Progress } from "@/ui/base/progress";
import { cn } from "@/lib/utils";
import { brl } from "./currency";
import type { SuccessData } from "../types";

export function MonthGoalCard({ monthGoal, monthDelta }: { monthGoal: SuccessData["monthGoal"]; monthDelta: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" /> Meta do mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-bold tabular-nums">{brl(monthGoal.achieved)}</p>
          <p className="text-xs text-muted-foreground">de {brl(monthGoal.goal)}</p>
        </div>
        <Progress value={Math.min(100, monthGoal.pct)} className="h-2" />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{monthGoal.pct.toFixed(1)}% atingido</span>
          <Badge variant={monthGoal.pct >= 100 ? "default" : monthGoal.pct >= 80 ? "secondary" : "outline"}>
            {monthGoal.pct >= 100 ? "Batida" : monthGoal.pct >= 80 ? "No caminho" : "Atenção"}
          </Badge>
        </div>
        <div className="pt-2 border-t">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Vs mês anterior</p>
          <div className={cn("text-sm font-semibold flex items-center gap-1",
            monthDelta >= 0 ? "text-emerald-500" : "text-red-500")}>
            {monthDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {monthDelta >= 0 ? "+" : ""}{monthDelta.toFixed(1)}%
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
