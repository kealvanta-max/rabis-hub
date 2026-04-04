"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { collection, getDocs, doc, updateDoc, getDoc, setDoc, deleteDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToastContext } from "@/components/layout/toast-provider";
import Navigation from "@/components/layout/navigation";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Modal from "@/components/ui/modal";
import { planLabels } from "@/lib/plans-data";
import type { UserDoc, TestimonialDoc } from "@/lib/types";
import dynamic from "next/dynamic";

const UserMapView = dynamic(() => import("@/components/admin/user-map"), { ssr: false });

interface UserItem extends UserDoc {
  id: string;
}

interface TestimonialItem extends TestimonialDoc {
  id: string;
}

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToastContext();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  const [waLinks, setWaLinks] = useState<Record<string, string>>({});
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "map" | "testimonials" | "whatsapp" | "announcements">("users");
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

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
      if (wSnap.exists()) setWaLinks(wSnap.data() as Record<string, string>);

      // Announcements
      const aSnap = await getDocs(collection(db, "announcements"));
      const aData = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAnnouncements(aData);
    } catch (err) {
      console.error("Admin fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/");
      return;
    }
    if (user && isAdmin) fetchData();
  }, [user, isAdmin, authLoading, router, fetchData]);

  const setStatus = async (userId: string, status: "approved" | "rejected" | "pending") => {
    try {
      const updates: Record<string, string> = { status };
      if (status === "approved") {
        const u = users.find((x) => x.id === userId);
        if (u) updates.whatsappLink = waLinks[u.plan] || "";
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
    } catch {
      addToast("Failed to update user status", "error");
    }
  };

  const saveWaLinks = async () => {
    try {
      await setDoc(doc(db, "settings", "waLinks"), waLinks);
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
    const header = "Name,Email,Phone,Plan,Status,Location,GPS,Date\n";
    const rows = filteredUsers.map((u) =>
      `"${u.name}","${u.email}","${u.phone}","${planLabels[u.plan] || u.plan}","${u.status}","${u.gpsAddress || u.location}","${u.gpsLat},${u.gpsLng}","${u.createdAt?.toDate?.()?.toLocaleDateString() || ""}"`
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

  const filteredUsers = users.filter((u) => {
    if (filter !== "all" && u.status !== filter) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: users.length,
    pending: users.filter((u) => u.status === "pending").length,
    approved: users.filter((u) => u.status === "approved").length,
    rejected: users.filter((u) => u.status === "rejected").length,
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="font-display text-3xl text-white">Admin Dashboard</h1>
              <p className="text-sm text-gray-400 mt-1">Manage users, reviews, and community links.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={downloadCSV}>
                Export CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadAllJSON}>
                Export JSON (All Data)
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Users" value={stats.total} color="text-white" />
            <StatCard label="Pending" value={stats.pending} color="text-yellow-400" />
            <StatCard label="Approved" value={stats.approved} color="text-emerald-400" />
            <StatCard label="Rejected" value={stats.rejected} color="text-red-400" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-xl p-1 overflow-x-auto">
            {(["users", "map", "testimonials", "whatsapp", "announcements"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-primary text-navy-dark"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab === "users" ? "Users" : tab === "map" ? "Map View" : tab === "testimonials" ? "Reviews" : tab === "whatsapp" ? "WhatsApp Links" : "Announcements"}
              </button>
            ))}
          </div>

          {/* === USERS TAB === */}
          {activeTab === "users" && (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <Input
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sm:max-w-xs"
                />
                <div className="flex gap-2">
                  {["all", "pending", "approved", "rejected"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer capitalize ${
                        filter === f
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "text-gray-500 hover:text-white border border-white/10"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* User Cards */}
              <div className="space-y-4">
                {filteredUsers.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No users found.</p>
                ) : (
                  filteredUsers.map((u) => (
                    <Card key={u.id} className="!p-5">
                      <div className="flex items-start gap-4 flex-wrap">
                        {/* Avatar */}
                        {u.passportPhoto ? (
                          <img src={u.passportPhoto} alt={u.name} className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-primary font-bold text-lg">{u.name.charAt(0)}</span>
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-white truncate">{u.name}</h3>
                            <Badge status={u.status} />
                          </div>
                          <p className="text-xs text-gray-500">{u.email} • {u.phone}</p>
                          <p className="text-xs text-gray-500">{planLabels[u.plan] || u.plan} • {u.gpsAddress || u.location || "No location"}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => setSelectedUser(u)}
                            className="px-3 py-1.5 text-xs bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            View
                          </button>
                          {u.status !== "approved" && (
                            <button
                              onClick={() => setStatus(u.id, "approved")}
                              className="px-3 py-1.5 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                          {u.status !== "rejected" && (
                            <button
                              onClick={() => setStatus(u.id, "rejected")}
                              className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          )}
                          {u.status !== "pending" && (
                            <button
                              onClick={() => setStatus(u.id, "pending")}
                              className="px-3 py-1.5 text-xs bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/30 transition-colors cursor-pointer"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}

          {/* === MAP TAB === */}
          {activeTab === "map" && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden" style={{ height: "600px" }}>
              <UserMapView users={users} />
            </div>
          )}

          {/* === TESTIMONIALS TAB === */}
          {activeTab === "testimonials" && (
            <div className="space-y-4">
              <AddStaticTestimonial onAdd={(t) => setTestimonials((prev) => [t, ...prev])} />
              {testimonials.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No testimonials yet.</p>
              ) : (
                testimonials.map((t) => (
                  <Card key={t.id} className="!p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-white">{t.userName}</span>
                          <Badge status={t.status} />
                          {t.isStatic && (
                            <span className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded-full">Static</span>
                          )}
                        </div>
                        <div className="flex gap-0.5 mb-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <svg key={i} className={`w-3.5 h-3.5 ${i < t.rating ? "text-primary" : "text-gray-700"}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                        <p className="text-sm text-gray-300">&ldquo;{t.review}&rdquo;</p>
                        <p className="text-xs text-gray-500 mt-1">{t.planName}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {t.status !== "approved" && (
                          <button onClick={() => setTestimonialStatus(t.id, "approved")} className="px-3 py-1.5 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors cursor-pointer">
                            Approve
                          </button>
                        )}
                        {t.status !== "rejected" && (
                          <button onClick={() => setTestimonialStatus(t.id, "rejected")} className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors cursor-pointer">
                            Reject
                          </button>
                        )}
                        <button onClick={() => deleteTestimonial(t.id)} className="px-3 py-1.5 text-xs bg-gray-600/20 text-gray-400 rounded-lg hover:bg-gray-600/30 transition-colors cursor-pointer">
                          Delete
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* === WHATSAPP TAB === */}
          {activeTab === "whatsapp" && (
            <Card>
              <h3 className="text-lg font-bold text-white mb-4">WhatsApp Group Links</h3>
              <p className="text-sm text-gray-400 mb-6">
                Set the WhatsApp group link for each plan. When you approve a user, they&apos;ll automatically get the link matching their plan.
              </p>
              <div className="space-y-4">
                {Object.entries(planLabels).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 w-40 shrink-0">{label}</span>
                    <input
                      type="url"
                      value={waLinks[key] || ""}
                      onChange={(e) => setWaLinks((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder="https://chat.whatsapp.com/..."
                      className="flex-1 px-3 py-2 bg-navy-dark/60 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Button onClick={saveWaLinks}>Save All Links</Button>
              </div>
            </Card>
          )}

          {/* === ANNOUNCEMENTS TAB === */}
          {activeTab === "announcements" && (
            <div className="space-y-4">
              <AddAnnouncement onAdd={(a) => setAnnouncements((prev) => [a, ...prev])} />
              {announcements.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No announcements yet.</p>
              ) : (
                announcements.map((a) => (
                  <Card key={a.id} className="!p-5 border-l-4 border-l-primary selection:bg-primary/20">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-white mb-1">{a.title}</h3>
                        <p className="text-sm text-gray-300">{a.message}</p>
                        <p className="text-xs text-gray-500 mt-2">{a.createdAt?.toDate?.()?.toLocaleString()}</p>
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
        </div>
      </main>

      {/* User Detail Modal */}
      <Modal isOpen={!!selectedUser} onClose={() => setSelectedUser(null)} title={selectedUser?.name || ""} maxWidth="max-w-2xl">
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex justify-end">
               <Button variant="secondary" size="sm" onClick={() => downloadSingleUserJSON(selectedUser)}>
                 Download User Data (JSON)
               </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Email:</span> <span className="text-white ml-1">{selectedUser.email}</span></div>
              <div><span className="text-gray-500">Phone:</span> <span className="text-white ml-1">{selectedUser.phone}</span></div>
              <div><span className="text-gray-500">Plan:</span> <span className="text-white ml-1">{planLabels[selectedUser.plan] || selectedUser.plan}</span></div>
              <div><span className="text-gray-500">Status:</span> <Badge status={selectedUser.status} /></div>
              <div className="col-span-2"><span className="text-gray-500">Location:</span> <span className="text-white ml-1">{selectedUser.gpsAddress || selectedUser.location}</span></div>
              <div className="col-span-2"><span className="text-gray-500">GPS:</span> <span className="text-white ml-1">{selectedUser.gpsLat?.toFixed(6)}, {selectedUser.gpsLng?.toFixed(6)}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
              {[
                { label: "Ghana Card Front", url: selectedUser.ghanaCardFront },
                { label: "Ghana Card Back", url: selectedUser.ghanaCardBack },
                { label: "Passport Photo", url: selectedUser.passportPhoto },
              ].map((d) => (
                <div key={d.label}>
                  <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      <img src={d.url} alt={d.label} className="w-full h-32 object-cover rounded-lg border border-white/10 hover:border-primary/30 transition-colors" />
                    </a>
                  ) : (
                    <div className="w-full h-32 bg-white/5 rounded-lg flex items-center justify-center text-xs text-gray-600">Not uploaded</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
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
      <Button size="sm" onClick={() => setOpen(true)}>Add Static Testimonial</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Static Testimonial">
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Plan Name" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Daily GH₵6" />
          <div>
            <p className="text-sm text-gray-300 mb-1">Rating</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)} className="cursor-pointer">
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

function AddAnnouncement({ onAdd }: { onAdd: (a: any) => void }) {
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!title || !message) return;
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, "announcements"), {
        title,
        message,
        createdAt: Timestamp.now(),
      });
      onAdd({
        id: docRef.id,
        title,
        message,
        createdAt: Timestamp.now(),
      });
      addToast("Announcement pushed to users!", "success");
      setOpen(false);
      setTitle("");
      setMessage("");
    } catch {
      addToast("Failed to create announcement", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Create Global Announcement</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="New Announcement">
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Important Update" required />
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
