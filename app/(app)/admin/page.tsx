"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminsOnly } from "@/app/components/AdminsOnly";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import { BackupsCard, SsoSetup, UpdateNotice } from "@/app/components/OpsCards";
import PushSection from "./PushSection";
import UsersSection, { type AdminUser } from "./UsersSection";

/** One admin page, laid out like NitroLog's and AstroFit's: accounts, then everything else in sections. */
export default function AdminPage() {
  return <Suspense fallback={<div className="loading">Loading…</div>}><Admin /></Suspense>;
}

function Admin() {
  const me = useMe();
  const params = useSearchParams();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [creating, setCreating] = useState(false);
  const notifyTitle = params?.get("notifyTitle");
  const notifyBody = params?.get("notifyBody");
  const [prefill] = useState(notifyTitle || notifyBody ? { title: notifyTitle ?? "", body: notifyBody ?? "" } : null);

  const reload = useCallback(() => {
    fetch("/api/users").then(r => (r.ok ? r.json() : [])).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => setUsers([]));
  }, []);
  useEffect(() => { if (me.isAdmin) reload(); }, [me.isAdmin, reload]);

  if (!me.isAdmin) return <AdminsOnly />;

  return (
    <div className="page page-narrow">
      <div className="dash-header">
        <div><h1 className="dash-title">Admin</h1><p className="dash-subtitle">Accounts on this server</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New user</button>
      </div>
      <UpdateNotice />
      <UsersSection users={users} reload={reload} creating={creating} setCreating={setCreating} />

      <PushSection prefill={prefill} />
      <SsoSetup appName="ComicOrbit" />
      <BackupsCard />
    </div>
  );
}
