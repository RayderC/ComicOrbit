"use client";

import Link from "next/link";

// Stroked icons drawn on a 24 x 24 grid, matching NitroLog and AstroFit.
const ICONS: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5",
  book: "M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h14v-4",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  menu: "M3 6h18M3 12h18M3 18h18",
  gauge: "M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  settings: "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

export type Tab = { label: string; icon: string; href?: string; active?: boolean; onClick?: () => void };

/** The bar along the bottom of the screen on phones. Hidden on larger screens by the stylesheet. */
export default function TabBar({ tabs }: { tabs: Tab[] }) {
  return (
    <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map(t => {
        const inner = (
          <>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONS[t.icon]} />
            </svg>
            <span>{t.label}</span>
          </>
        );
        const cls = `tabbar-item${t.active ? " active" : ""}`;
        return t.href
          ? <Link key={t.label} href={t.href} className={cls} aria-current={t.active ? "page" : undefined}>{inner}</Link>
          : <button key={t.label} type="button" className={cls} onClick={t.onClick}>{inner}</button>;
      })}
    </nav>
  );
}
