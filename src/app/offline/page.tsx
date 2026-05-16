export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold mb-2">You&apos;re offline</h1>
      <p className="text-muted-foreground mb-4 max-w-md">
        It looks like you don&apos;t have an internet connection. You can continue using the parts of
        StockPilot that are cached, and your data will sync when you&apos;re back online.
      </p>
      <p className="text-xs text-muted-foreground">
        Try reconnecting to the internet and refreshing the page.
      </p>
    </div>
  );
}
