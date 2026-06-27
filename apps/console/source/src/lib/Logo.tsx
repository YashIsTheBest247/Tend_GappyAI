import React from "react";

/** Tend logomark — chat bubble (with a resolved check) on a desk, with an AI sparkle. */
export function Logo({ size = 38, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Tend logo" role="img">
      <defs>
        <linearGradient id="tend-g" x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3bbd78" />
          <stop offset="1" stopColor="#1b7d4d" />
        </linearGradient>
      </defs>

      {/* app-icon background */}
      <rect width="48" height="48" rx="14" fill="url(#tend-g)" />
      <rect x="0.6" y="0.6" width="46.8" height="46.8" rx="13.4" fill="none" stroke="rgba(255,255,255,0.16)" />

      {/* desk */}
      <rect x="9" y="32.6" width="30" height="3" rx="1.5" fill="#fff" />
      <rect x="14" y="35.2" width="2.8" height="6.4" rx="1.4" fill="#fff" />
      <rect x="31.2" y="35.2" width="2.8" height="6.4" rx="1.4" fill="#fff" />

      {/* chat bubble + tail */}
      <rect x="10" y="8" width="24" height="17" rx="6" fill="#fff" />
      <path d="M16.5 24 L13.6 29.6 L21.4 24 Z" fill="#fff" />

      {/* resolved check */}
      <path d="M16.8 16.6 l3.5 3.5 L29 11.4" stroke="#15693d" strokeWidth="3"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* AI sparkle */}
      <path d="M39 4.4c.42 2.9 1.3 3.78 4.2 4.2-2.9.42-3.78 1.3-4.2 4.2-.42-2.9-1.3-3.78-4.2-4.2 2.9-.42 3.78-1.3 4.2-4.2Z" fill="#fff" />
    </svg>
  );
}
