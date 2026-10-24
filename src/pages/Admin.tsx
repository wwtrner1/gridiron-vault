import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { useOwner } from "../lib/owner";
import { AuditTab } from "./admin/AuditTab";
import { UserDetail } from "./admin/UserDetail";
import { VisitorsTab } from "./admin/VisitorsTab";
import { UsersTab, useAdminUsers } from "./admin/UsersTab";
import "../styles/admin.css";

const TABS = [
  { id: "users", label: "Users" },
  { id: "visitors", label: "Visitors" },
  { id: "watch", label: "Watch list" },
  { id: "recovery", label: "Account recovery" },
  { id: "audit", label: "Audit log" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Owner-only console. The page only hides itself; every /api/admin call is checked on the server. */
export function Admin() {
  const owner = useOwner();
  const [tab, setTab] = useState<TabId>("users");
  const data = useAdminUsers();
  const [openId, setOpenId] = useState("");
  const open = (id: string) => {
    setOpenId(id);
    setTab("recovery");
  };

  if (owner === false) return <Navigate to="/account" replace />;
  if (owner === null) return <Shell title="Admin"><p className="hint">Checking your access…</p></Shell>;

  return (
    <Shell title="Admin">
      <div className="adm">
        <div className="chip-row" role="tablist" aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`chip${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "users" && <UsersTab {...data} onOpen={open} />}
        {tab === "visitors" && <VisitorsTab />}
        {tab === "watch" && <UsersTab {...data} watch onOpen={open} />}
        {tab === "recovery" &&
          (openId ? (
            <UserDetail id={openId} onBack={() => setTab("users")} />
          ) : (
            <p className="hint">Open a coach from the Users tab to see their plays and playbooks, restore something they deleted, or download all their data.</p>
          ))}
        {tab === "audit" && <AuditTab />}
      </div>
    </Shell>
  );
}
