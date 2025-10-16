
'use client';

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface ChartDataPoint {
  name: string;
  value: number;
  threshold?: number;
}
interface SuggestionChartProps {
  title: string;
  data: ChartDataPoint[];
}

export function SuggestionChart({ title, data }: SuggestionChartProps) {
  const hasThreshold = data.some(d => d.threshold !== undefined && d.threshold !== null);
  
  const chartConfig = {
      value: {
        label: hasThreshold ? 'Quantity' : 'Value',
        color: 'hsl(var(--chart-1))',
      },
      ...(hasThreshold && {
        threshold: {
          label: 'Threshold',
          color: 'hsl(var(--chart-2))',
        },
      }),
    };

  return (
    <Card className="border-dashed">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <ChartContainer
          config={chartConfig}
          className="h-[150px] w-full"
        >
          <BarChart
            data={data}
            layout="horizontal"
            margin={{ left: 10, right: 10, top: 10, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-xs"
            />
            <YAxis dataKey="value" type="number" />
            <ChartTooltip
              cursor={{ fill: 'hsl(var(--muted))' }}
              content={<ChartTooltipContent />}
            />
            <Legend />
            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            {hasThreshold && <Bar dataKey="threshold" fill="var(--color-threshold)" radius={4} />}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
