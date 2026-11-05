"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { SkeletonPage } from "@/components/ui/skeleton";
import { collection, getDocs, doc, updateDoc, getDoc, setDoc, deleteDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToastContext } from "@/components/layout/toast-provider";
import Navigation from "@/components/layout/navigation";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { getPlanLabel, planLabels } from "@/lib/plans-data";
import { formatDate, formatDateTime } from "@/lib/utils";
import { isFirebaseConfigured } from "@/lib/firebase";
import type { UserDoc, TestimonialDoc } from "@/lib/types";
import { notifyUserApproval, notifyUserRejection, notifyAdminNewRegistration } from "@/lib/notifications";
import dynamic from "next/dynamic";
import InsightsPanel from "@/components/admin/insights";
import AdminTabs, { type AdminTab } from "@/components/admin/admin-tabs";
import ActionButton from "@/components/admin/action-button";
import UserRow from "@/components/admin/user-row";
import UserDetailModal from "@/components/admin/user-detail-modal";
import ReviewsPanel from "@/components/admin/reviews-panel";
import WhatsAppLinksPanel from "@/components/admin/whatsapp-links-panel";
import {
  AddCustomPlan,
  EditCustomPlan,
  PlanLinkBadge,
} from "@/components/admin/custom-plan-form";
import type { CustomPlan } from "@/lib/custom-plans";
import { memberWhatsappLink, planWhatsappLink } from "@/lib/custom-plans";
import type { UserItem, TestimonialItem } from "@/components/admin/types";
import { filterMembers } from "@/lib/admin-query";
import { track } from "@/lib/analytics";

const UserMapView = dynamic(() => import("@/components/admin/user-map"), { ssr: false });

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToastContext();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  const [waLinks, setWaLinks] = useState<Record<string, string>>({});
  const [savedWaLinks, setSavedWaLinks] = useState<Record<string, string>>({});
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [customPlans, setCustomPlans] = useState<CustomPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<
    "insights" | "users" | "map" | "testimonials" | "whatsapp" | "announcements" | "plans"
  >("insights");
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    cloudinaryConfigured: boolean;
    emailProvider: string | null;
    integrations?: { id: string; label: string; category: string; configured: boolean; missing: string[] }[];
  } | null>(null);

  const unconfigured = health?.integrations?.filter((i) => !i.configured) ?? [];

  const fetchData = useCallback(async () => {
    try {
      // Users
      const uSnap = await getDocs(collection(db, "users"));
      const uData = uSnap.docs.map((d) => ({ id: d.id, ...d.data() } as UserItem));
      setUsers(uData);

      // Testimonials
      const tSnap = await getDocs(collection(db, "testimonials"));
      const tData = tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TestimonialItem));
      setTestimonials(tData);

      // WA Links
      const wSnap = await getDoc(doc(db, "settings", "waLinks"));
      if (wSnap.exists()) {
        const stored = wSnap.data() as Record<string, string>;
        setWaLinks(stored);
        setSavedWaLinks(stored);
      }

      // Announcements
      const aSnap = await getDocs(collection(db, "announcements"));
      const aData = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAnnouncements(aData);

      // Custom Plans

      const pSnap = await getDoc(doc(db, "settings", "customPlans"));
      if (pSnap.exists()) {
        setCustomPlans(pSnap.data().plans || []);
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
      addToast("Could not load admin data. Check your connection and Firestore rules.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/");
      return;
    }
    if (user && isAdmin) fetchData();
  }, [user, isAdmin, authLoading, router, fetchData]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setHealth(data))
      .catch(() => setHealth(null));
  }, [isAdmin]);

  /** Record money Rabi has received. Members can read it; only admins write it. */
  const recordContribution = async (userId: string, amount: number) => {
    const member = users.find((entry) => entry.id === userId);
    if (!member) return;
    const today = new Date().toISOString().slice(0, 10);
    const contributions = [
      ...(Array.isArray(member.contributions) ? member.contributions : []),
      { date: today, amount },
    ];
    setUsers((previous) =>
      previous.map((entry) => (entry.id === userId ? { ...entry, contributions } : entry))
    );
    try {
      await updateDoc(doc(db, "users", userId), { contributions });
      addToast(`GH₵${amount} recorded for ${member.name?.split(" ")[0] || "member"}.`, "success");
    } catch {
      addToast("Could not save that payment.", "error");
      setUsers((previous) =>
        previous.map((entry) =>
          entry.id === userId ? { ...entry, contributions: member.contributions } : entry
        )
      );
    }
  };

  const removeContribution = async (userId: string, index: number) => {
    const member = users.find((entry) => entry.id === userId);
    if (!member) return;
    const contributions = (member.contributions ?? []).filter((_, position) => position !== index);
    try {
      await updateDoc(doc(db, "users", userId), { contributions });
      setUsers((previous) =>
        previous.map((entry) => (entry.id === userId ? { ...entry, contributions } : entry))
      );
      addToast("Payment removed.", "success");
    } catch {
      addToast("Could not remove that payment.", "error");
    }
  };

  const setStatus = async (userId: string, status: "approved" | "rejected" | "pending", reason?: string) => {
    track(status === "approved" ? "admin_approved" : status === "rejected" ? "admin_rejected" : "admin_reset", {
      userId,
    });
    try {
      const updates: Record<string, string> = { status };
      const u = users.find((x) => x.id === userId);
      if (status === "approved") {
        const link =
          (u &&
            (memberWhatsappLink(
              Array.isArray(u.plans) && u.plans.length > 0 ? u.plans : [u.plan],
              customPlans,
              waLinks
            ) ||
              "")) ||
          "";
        updates.whatsappLink = link;
        if (u && !link) {
          addToast("Approved, but no WhatsApp link is saved for this plan yet.", "info");
        }
      }
      if (status === "pending" || status === "rejected") {
        updates.whatsappLink = "";
      }
      await updateDoc(doc(db, "users", userId), updates);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, status: status as UserDoc["status"], whatsappLink: updates.whatsappLink || u.whatsappLink } : u
        )
      );
      addToast(`User ${status}`, "success");

      // Send email notification
      if (u) {
        if (status === "approved") {
          notifyUserApproval(u.email, u.name, getPlanLabel(u.plan, customPlans)).catch(console.error);
        } else if (status === "rejected") {
          notifyUserRejection(u.email, u.name, reason || "").catch(console.error);
        }
      }
    } catch {
      addToast("Failed to update user status", "error");
    }
  };

  const saveWaLinks = async () => {
    try {
      await setDoc(doc(db, "settings", "waLinks"), waLinks);
      setSavedWaLinks(waLinks);
      addToast("WhatsApp links saved!", "success");
    } catch {
      addToast("Failed to save links", "error");
    }
  };

  const setTestimonialStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      await updateDoc(doc(db, "testimonials", id), { status });
      setTestimonials((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
      addToast(`Testimonial ${status}`, "success");
    } catch {
      addToast("Failed to update testimonial", "error");
    }
  };

  const deleteTestimonial = async (id: string) => {
    try {
      await deleteDoc(doc(db, "testimonials", id));
      setTestimonials((prev) => prev.filter((t) => t.id !== id));
      addToast("Testimonial deleted", "success");
    } catch {
      addToast("Failed to delete testimonial", "error");
    }
  };

  const downloadCSV = () => {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = "Name,Email,Phone,Plan,Status,Location,GPS,Date\n";
    const rows = filteredUsers.map((u) =>
      [
        u.name,
        u.email,
        u.phone,
        getPlanLabel(u.plan, customPlans),
        u.status,
        u.gpsAddress || u.location,
        `${u.gpsLat},${u.gpsLng}`,
        formatDate(u.createdAt, ""),
      ]
        .map(escape)
        .join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rabi-users.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const downloadAllJSON = () => {
    const dataStr = JSON.stringify(filteredUsers, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rabi-users-all-with-images.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const downloadSingleUserJSON = (u: UserItem) => {
    const dataStr = JSON.stringify(u, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rabi-user-${u.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const filteredUsers = filterMembers(users, { status: filter, search });

  const stats = {
    total: users.length,
    pending: users.filter((u) => u.status === "pending").length,
    approved: users.filter((u) => u.status === "approved").length,
    rejected: users.filter((u) => u.status === "rejected").length,
  };

  if (authLoading || loading) {
    return <SkeletonPage cards={4} />;
  }

  if (!isAdmin) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <h1 className="font-grotesk text-3xl font-semibold text-white mb-3">Admin access required</h1>
          <p className="text-sm text-gray-400 mb-6 max-w-md">
            This area is restricted to administrators. Sign in with an admin account, or ask an owner to grant your
            account the <code className="text-primary">admin</code> custom claim.
          </p>
          <Button onClick={() => router.replace("/auth?mode=signin")}>Go to sign in</Button>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen px-4 pb-28 pt-24 md:pb-16">
        <div className="mx-auto max-w-6xl">
          {/* Header — sans display face on purpose: this is an operations screen,
              not a marketing page, so the serif voice stays on the public site. */}
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400/80">
                Operations
              </p>
              <h1 className="mt-1 font-grotesk text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Admin dashboard
              </h1>
              <p className="mt-1 max-w-prose text-sm text-gray-400">
                Members, reviews and community links, everything Rabi needs, nothing else.
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <ActionButton variant="neutral" size="md" onClick={downloadCSV} className="flex-1 sm:flex-none">
                Export CSV
              </ActionButton>
              <ActionButton variant="ghost" size="md" onClick={downloadAllJSON} className="flex-1 sm:flex-none">
                Export JSON
              </ActionButton>
            </div>
          </header>

          {/* Stats */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total members" value={stats.total} color="text-white" />
            <StatCard label="Pending" value={stats.pending} color="text-amber-300" />
            <StatCard label="Approved" value={stats.approved} color="text-emerald-300" />
            <StatCard label="Rejected" value={stats.rejected} color="text-red-300" />
          </div>

          {/* System status */}
          {(!isFirebaseConfigured || unconfigured.length > 0) && (
            <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 003.82 21h16.36a2 2 0 001.71-2.96L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-amber-200">Setup needs attention</h3>
                  <p className="text-xs text-amber-200/70 mb-3">
                    Some integrations are missing, so parts of the site will not work for members.
                  </p>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {!isFirebaseConfigured && (
                      <li className="min-w-0">
                        <StatusPill ok={false} label="Firebase" />
                      </li>
                    )}
                    {unconfigured
                      .filter((i) => i.id !== "firebase")
                      .map((integration) => (
                        <li key={integration.id} className="flex min-w-0 items-start gap-2">
                          <StatusPill ok={false} label={integration.label} />
                          <span className="min-w-0 truncate text-[11px] text-amber-200/50">
                            {integration.missing.join(", ")}
                          </span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-3 text-[11px] text-amber-200/60">
                    Values go in Vercel → Settings → Environment Variables, then run
                    <code className="mx-1 text-amber-100">npm run env:check</code>
                    locally. Full table: <code className="text-amber-100">docs/INTEGRATIONS.md</code>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <AdminTabs
            value={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
            tabs={[
              { id: "insights", label: "Insights" },
              { id: "users", label: "Users", count: stats.pending },
              {
                id: "testimonials",
                label: "Reviews",
                count: testimonials.filter((t) => t.status === "pending").length,
              },
              { id: "whatsapp", label: "WhatsApp links" },
              { id: "announcements", label: "Announcements" },
              { id: "plans", label: "Custom plans" },
              { id: "map", label: "Map" },
            ] satisfies AdminTab[]}
          />

          {/* === USERS TAB === */}
          {activeTab === "insights" && (
            <div id="admin-panel-insights" role="tabpanel" aria-labelledby="admin-tab-insights">
              <InsightsPanel
              users={users}
              announcements={announcements}
                onOpenUser={(id) => {
                  const found = users.find((u) => u.id === id);
                  if (found) {
                    setSelectedUser(found);
                    setActiveTab("users");
                  }
                }}
              />
            </div>
          )}

          {activeTab === "users" && (
            <section
              id="admin-panel-users"
              role="tabpanel"
              aria-labelledby="admin-tab-users"
              className="space-y-4"
            >
              {/* Toolbar: search gets its own row on phones, filters scroll. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block w-full sm:max-w-xs">
                  <span className="sr-only">Search members</span>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or email…"
                    className="h-11 w-full rounded-xl bg-black/30 pl-9 pr-3 text-sm text-gray-100 outline-none ring-1 ring-inset ring-white/10 transition-colors placeholder:text-gray-600 focus:ring-emerald-400/60"
                  />
                </label>

                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  {(["all", "pending", "approved", "rejected"] as const).map((option) => {
                    const active = filter === option;
                    const count =
                      option === "all" ? users.length : users.filter((u) => u.status === option).length;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFilter(option)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${
                          active
                            ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
                            : "text-gray-400 ring-1 ring-inset ring-white/10 hover:text-white"
                        }`}
                      >
                        {option}
                        <span className={active ? "text-[10px] text-emerald-300/80" : "text-[10px] text-gray-500"}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-gray-500" role="status">
                Showing {filteredUsers.length} of {users.length} members
              </p>

              {filteredUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
                  <p className="font-grotesk text-sm font-semibold text-white">No members here</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {search ? `Nothing matches “${search}”.` : "Try a different filter."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {filteredUsers.map((u) => (
                    <li key={u.id}>
                      <UserRow
                        user={u}
                        planLabel={getPlanLabel(u.plan, customPlans)}
                        onOpen={() => setSelectedUser(u)}
                        onApprove={() => setStatus(u.id, "approved")}
                        onReject={() => setShowRejectModal(u.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* === MAP TAB === */}
          {activeTab === "map" && (
            <div
              id="admin-panel-map"
              role="tabpanel"
              aria-labelledby="admin-tab-map"
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <div className="h-[60vh] max-h-[600px] min-h-[360px]">
                <UserMapView users={users} />
              </div>
            </div>
          )}

          {activeTab === "testimonials" && (
            <div id="admin-panel-testimonials" role="tabpanel" aria-labelledby="admin-tab-testimonials">
              <ReviewsPanel
                testimonials={testimonials}
                onStatus={(id, status) => setTestimonialStatus(id, status)}
                onDelete={(id) => deleteTestimonial(id)}
                toolbar={<AddStaticTestimonial onAdd={(t) => setTestimonials((prev) => [t, ...prev])} />}
              />
            </div>
          )}

          {activeTab === "whatsapp" && (
            <div id="admin-panel-whatsapp" role="tabpanel" aria-labelledby="admin-tab-whatsapp">
              <WhatsAppLinksPanel
                customPlans={customPlans}
                links={waLinks}
                baseline={savedWaLinks}
                onChange={(key, value) => setWaLinks((prev) => ({ ...prev, [key]: value }))}
                onSave={saveWaLinks}
              />
            </div>
          )}

          {/* === ANNOUNCEMENTS TAB === */}
          {activeTab === "announcements" && (
            <div
              id="admin-panel-announcements"
              role="tabpanel"
              aria-labelledby="admin-tab-announcements"
              className="space-y-4"
            >
              <AddAnnouncement
                customPlans={customPlans}
                onAdd={(a) => setAnnouncements((prev) => [a, ...prev])}
              />
              {announcements.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No announcements yet.</p>
              ) : (
                announcements.map((a) => (
                  <Card key={a.id} className="!p-5 border-l-4 border-l-primary selection:bg-primary/20">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-white mb-1">{a.title}</h3>
                        <p className="text-sm text-gray-300">{a.message}</p>
                        <p className="text-[11px] text-primary/70 mt-1">
                          Audience: {a.planId ? getPlanLabel(a.planId, customPlans) : "All members"}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{formatDateTime(a.createdAt)}</p>
                      </div>
                      <button onClick={async () => {
                        try {
                          await deleteDoc(doc(db, "announcements", a.id));
                          setAnnouncements((prev) => prev.filter((x) => x.id !== a.id));
                          addToast("Announcement removed", "success");
                        } catch {
                          addToast("Failed to delete", "error");
                        }
                      }} className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors cursor-pointer">
                        Delete
                      </button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}


          {/* === DYNAMIC PLANS TAB === */}
          {activeTab === "plans" && (
            <div
              id="admin-panel-plans"
              role="tabpanel"
              aria-labelledby="admin-tab-plans"
              className="space-y-4"
            >
              <AddCustomPlan existing={customPlans.map((p) => p.id)} onAdd={async (newPlan) => {
                const newPlans = [newPlan, ...customPlans];
                try {
                  await setDoc(doc(db, "settings", "customPlans"), { plans: newPlans });
                  setCustomPlans(newPlans);
                } catch (e) {
                  console.error("Save plans err:", e);
                }
              }} />
              {customPlans.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No custom plans created yet.</p>
              ) : (
                customPlans.map((plan) => (
                  <Card key={plan.id} className="!p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                          <h3 className="min-w-0 truncate font-bold text-white">{plan.name}</h3>
                          <PlanLinkBadge link={plan.whatsappLink || waLinks[plan.id]} />
                        </div>
                        <p className="text-sm text-gray-300">
                          Rate: {plan.amt ? `GH₵${plan.amt}` : "flexible"} | Frequency: {plan.freq || "flexible"}
                        </p>
                        <p className="text-sm text-emerald-400 font-semibold mt-1">
                          Target Return: {plan.ret ? `GH₵${plan.ret}` : "Rabi quotes this"}
                        </p>
                        {plan.whatsappLink && (
                          <a
                            href={plan.whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block truncate text-[11px] text-emerald-300 underline decoration-emerald-400/30 underline-offset-4"
                          >
                            Test the group link
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <EditCustomPlan
                          plan={plan}
                          existing={customPlans.map((p) => p.id)}
                          onSave={async (updated) => {
                            const newPlans = customPlans.map((p) => (p.id === updated.id ? updated : p));
                            await setDoc(doc(db, "settings", "customPlans"), { plans: newPlans });
                            setCustomPlans(newPlans);
                            addToast("Plan updated on the live site!", "success");
                          }}
                        />
                        <button onClick={async () => {
                          if (!window.confirm(`Delete "${plan.name}"? Members already on this plan keep it, but it disappears from the live site.`)) return;
                          const newPlans = customPlans.filter(p => p.id !== plan.id);
                          try {
                            await setDoc(doc(db, "settings", "customPlans"), { plans: newPlans });
                            setCustomPlans(newPlans);
                            addToast("Plan deleted successfully!", "success");
                          } catch (e) {
                            addToast("Failed to delete plan", "error");
                          }
                        }} className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors cursor-pointer">
                          Delete
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {/* Member review sheet */}
      <UserDetailModal
        user={selectedUser}
        planLabel={selectedUser ? getPlanLabel(selectedUser.plan, customPlans) : ""}
        ocrVerified={
          selectedUser?.ghanaCardOcrResult ? isOcrValid(selectedUser.ghanaCardOcrResult) : false
        }
        onClose={() => setSelectedUser(null)}
        onApprove={() => {
          if (!selectedUser) return;
          setStatus(selectedUser.id, "approved");
          setSelectedUser(null);
        }}
        onReject={() => {
          if (!selectedUser) return;
          setShowRejectModal(selectedUser.id);
          setSelectedUser(null);
        }}
        onReset={() => {
          if (!selectedUser) return;
          setStatus(selectedUser.id, "pending");
          setSelectedUser(null);
        }}
        onDownload={() => selectedUser && downloadSingleUserJSON(selectedUser)}
        onCopyGps={(value) => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => addToast("GPS copied", "success"))
            .catch(() => addToast("Could not copy GPS", "error"));
        }}
        onRecordContribution={(amount) =>
          selectedUser ? recordContribution(selectedUser.id, amount) : Promise.resolve()
        }
        onRemoveContribution={(index) =>
          selectedUser ? removeContribution(selectedUser.id, index) : Promise.resolve()
        }
      />

      {/* Rejection reason — the member receives this verbatim by email */}
      <Modal isOpen={!!showRejectModal} onClose={() => setShowRejectModal(null)} title="Reject application">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-gray-400">
            Tell the member why in one or two sentences, this exact text is emailed to them, so write it the way
            you would say it on WhatsApp.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              Reason
            </span>
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="e.g. The photo of your card is blurred, please send a clearer one."
              rows={4}
              className="w-full resize-y rounded-xl bg-black/30 px-3 py-2.5 text-sm text-gray-100 outline-none ring-1 ring-inset ring-white/10 transition-colors placeholder:text-gray-600 focus:ring-emerald-400/60"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ActionButton variant="neutral" size="md" onClick={() => setShowRejectModal(null)} fullWidth>
              Cancel
            </ActionButton>
            <ActionButton
              variant="danger"
              size="md"
              fullWidth
              onClick={() => {
                if (showRejectModal) {
                  setStatus(showRejectModal, "rejected", rejectionReason);
                  setShowRejectModal(null);
                  setRejectionReason("");
                }
              }}
            >
              Confirm rejection
            </ActionButton>
          </div>
        </div>
      </Modal>

    </>
  );
}

/**
 * OCR results are stored as JSON strings. Older records may be plain text or
 * malformed, which used to crash the whole admin dashboard with a JSON.parse error.
 */
function isOcrValid(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.valid);
  } catch {
    return false;
  }
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
        ok
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : "bg-red-500/15 text-red-300 border-red-500/30"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      {label}
      {ok ? " ready" : " missing"}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </Card>
  );
}

function AddStaticTestimonial({ onAdd }: { onAdd: (t: TestimonialItem) => void }) {
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name || !review) return;
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, "testimonials"), {
        userId: "admin-static",
        userName: name,
        userPhoto: "",
        planName: plan,
        rating,
        review,
        status: "approved",
        isStatic: true,
        createdAt: Timestamp.now(),
      });
      onAdd({
        id: docRef.id,
        userId: "admin-static",
        userName: name,
        userPhoto: "",
        planName: plan,
        rating,
        review,
        status: "approved",
        isStatic: true,
        createdAt: Timestamp.now(),
      } as TestimonialItem);
      addToast("Static testimonial added!", "success");
      setOpen(false);
      setName("");
      setPlan("");
      setRating(5);
      setReview("");
    } catch {
      addToast("Failed to add testimonial", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ActionButton
        variant="neutral"
        size="md"
        onClick={() => setOpen(true)}
        icon={<Plus className="h-4 w-4" />}
        className="shrink-0"
      >
        Add testimonial
      </ActionButton>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Static Testimonial">
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Plan Name" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Daily GH₵6" />
          <div>
            <p className="text-sm text-gray-300 mb-1">Rating</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRating(s)}
                  aria-label={`${s} star${s === 1 ? "" : "s"}`}
                  aria-pressed={s <= rating}
                  className="cursor-pointer rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                >
                  <svg className={`w-6 h-6 ${s <= rating ? "text-primary" : "text-gray-700"}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-300 mb-1">Review</p>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="w-full px-4 py-3 bg-navy-dark/60 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none h-24"
              required
            />
          </div>
          <Button onClick={handleAdd} loading={loading} className="w-full">Add Testimonial</Button>
        </div>
      </Modal>
    </>
  );
}

function AddAnnouncement({
  onAdd,
  customPlans = [],
}: {
  onAdd: (a: any) => void;
  customPlans?: any[];
}) {
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!title || !message) return;
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, "announcements"), {
        title,
        message,
        planId: planId || null,
        createdAt: Timestamp.now(),
      });
      onAdd({
        id: docRef.id,
        title,
        message,
        planId: planId || null,
        createdAt: Timestamp.now(),
      });
      addToast(planId ? "Announcement sent to that plan's members!" : "Announcement pushed to all users!", "success");
      setOpen(false);
      setTitle("");
      setMessage("");
      setPlanId("");
    } catch {
      addToast("Failed to create announcement", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Create Announcement</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="New Announcement">
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Important Update" required />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Audience</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full px-4 py-3 bg-navy-dark/60 border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
            >
              <option value="">All members</option>
              {Array.from(new Set([...Object.keys(planLabels), ...customPlans.map((p) => p.id)])).map((id) => (
                <option key={id} value={id}>
                  Only {getPlanLabel(id, customPlans)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-sm text-gray-300 mb-1">Message</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 bg-navy-dark/60 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none h-32"
              required
            />
          </div>
          <Button onClick={handleAdd} loading={loading} className="w-full">Push Announcement</Button>
        </div>
      </Modal>
    </>
  );
}

