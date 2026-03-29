interface BadgeProps {
  status: "pending" | "approved" | "rejected";
  size?: "sm" | "md";
}

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

const statusLabels: Record<string, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

export default function Badge({ status, size = "sm" }: BadgeProps) {
  const sizeClass = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${statusStyles[status]} ${sizeClass}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "pending"
            ? "bg-yellow-400 animate-pulse"
            : status === "approved"
            ? "bg-emerald-400"
            : "bg-red-400"
        }`}
      />
      {statusLabels[status]}
    </span>
  );
}
