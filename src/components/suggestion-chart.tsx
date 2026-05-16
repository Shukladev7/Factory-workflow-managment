
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
    <div className="w-full h-full min-h-0 overflow-hidden">
      {title && (
        <div className="pb-2">
          <h4 className="text-xs font-medium truncate">{title}</h4>
        </div>
      )}
      <div className="w-full h-full">
        <ChartContainer
          config={chartConfig}
          className="w-full h-full min-h-0"
        >
          <BarChart
            data={data}
            margin={{ left: 5, right: 5, top: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.2} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              className="text-[10px] fill-muted-foreground"
              interval={0}
              angle={-45}
              textAnchor="end"
              height={40}
            />
            <YAxis 
              tickLine={false}
              axisLine={false}
              className="text-[10px] fill-muted-foreground"
            />
            <ChartTooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              content={<ChartTooltipContent />}
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[2, 2, 0, 0]} />
            {hasThreshold && <Bar dataKey="threshold" fill="var(--color-threshold)" radius={[2, 2, 0, 0]} />}
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
