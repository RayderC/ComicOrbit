"use client";

import Link from "next/link";
import { AdminsOnly } from "@/app/components/AdminsOnly";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import SeriesSection from "../admin/SeriesSection";

/** Managing the series in the library: reading direction, cover, checking for chapters, removing. */
export default function SeriesPage() {
  const me = useMe();
  if (!me.isAdmin) return <AdminsOnly />;
  return (
    <div className="page page-narrow">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Series</h1>
          <p className="dash-subtitle">Reading direction, covers, new chapters, removing.</p>
        </div>
        <Link href="/add" className="btn btn-primary btn-sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }}><Icon name="plus" size={14} /> Add</Link>
      </div>
      <SeriesSection />
    </div>
  );
}
