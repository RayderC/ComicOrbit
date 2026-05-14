export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ongoing" ? "status-ongoing" :
    status === "completed" ? "status-completed" :
    status === "hiatus" ? "status-hiatus" :
    "status-unknown";
  const label = status === "unknown" ? "Unknown" : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

export function TypeBadge({ type }: { type: "manga" | "comic" }) {
  return <span className={`type-badge ${type === "manga" ? "type-manga" : "type-comic"}`}>{type}</span>;
}
