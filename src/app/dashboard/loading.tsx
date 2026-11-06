import { DashboardSkeleton } from "@/components/ui/skeleton";

/** Instant paint for the member dashboard while auth and data resolve. */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#020c06]">
      <DashboardSkeleton />
    </div>
  );
}
