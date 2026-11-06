import { SkeletonPage } from "@/components/ui/skeleton";

/**
 * Instant paint for a navigation to the admin panel.
 *
 * Next renders this the moment the route is requested, so a tap on "Admin" is
 * acknowledged immediately and the layout never jumps when the real screen
 * arrives. Same shape as the dashboard, so the switch is invisible.
 */
export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[#020c06]">
      <SkeletonPage cards={4} />
    </div>
  );
}
