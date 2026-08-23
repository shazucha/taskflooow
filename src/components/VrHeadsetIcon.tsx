// Vlastná ikona VR headsetu (lucide nemá VR okuliare)
import { cn } from "@/lib/utils";

export function VrHeadsetIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-6 w-6", className)}
      aria-hidden="true"
    >
      {/* Popruh */}
      <path d="M3 10V9a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1" />
      {/* Telo headsetu */}
      <rect x="2" y="9" width="20" height="9" rx="3" />
      {/* Výrez na nos */}
      <path d="M9.5 18c.7-1.4 1.4-2 2.5-2s1.8.6 2.5 2" />
      {/* Šošovky */}
      <path d="M6 12.5h2.5M15.5 12.5H18" />
    </svg>
  );
}
