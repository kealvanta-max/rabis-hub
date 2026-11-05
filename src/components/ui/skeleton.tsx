import { cn } from "@/lib/utils";

/**
 * Shimmering placeholders. Rendering the *shape* of the page while data loads
 * makes the app feel instant even on a slow Ghanaian mobile connection — the
 * layout never jumps, and the user never stares at a spinner.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="glass-soft rounded-2xl p-5" aria-hidden="true">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-3 h-3 w-16" />
    </div>
  );
}

export function SkeletonPlanCard() {
  return (
    <div className="glass-soft rounded-2xl p-5" aria-hidden="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-3 h-3 w-32" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="glass-soft flex items-center gap-4 rounded-2xl p-4" aria-hidden="true">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-7 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-soft rounded-2xl p-6" aria-hidden="true">
      <Skeleton className="h-4 w-28" />
      <SkeletonText className="mt-4" lines={3} />
    </div>
  );
}

/** Full-page skeleton used while the auth session resolves. */
export function SkeletonPage({ cards = 3 }: { cards?: number }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-24">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <SkeletonStatCard key={index} />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}

/** Member dashboard shell — keeps the layout stable while auth resolves. */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-28">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <SkeletonPlanCard />
        <SkeletonPlanCard />
      </div>

      <div className="mt-8 space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}

/** Payments page shell. */
export function PaymentsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-28 pt-28">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-4 h-8 w-52" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="glass-soft rounded-2xl p-5" aria-hidden="true">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
            <div className="mt-5 flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-xl" />
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
