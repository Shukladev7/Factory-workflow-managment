
'use client';

import { type ActivityLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { format } from 'date-fns';

interface ActivityLogListProps {
  log: ActivityLog[];
}

export function ActivityLogList({ log }: ActivityLogListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activity History</CardTitle>
      </CardHeader>
      <CardContent className="pr-0">
        <div className="relative pl-6 after:absolute after:inset-y-0 after:w-px after:bg-muted-foreground/20 after:left-0">
          {log.length > 0 ? (
            log.map((entry, index) => (
              <div key={entry.id} className="grid gap-2 text-sm relative pb-4">
                <div className="absolute w-3 h-3 -left-[7px] mt-1.5 rounded-full bg-primary" />
                <div className="font-medium">{entry.action}</div>
                <div className="text-muted-foreground">{entry.details}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(entry.timestamp), "MMM d, yyyy, h:mm a")} by {entry.user}
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No activity recorded for this item yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
