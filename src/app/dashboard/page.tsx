"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/context/auth-context";
import { doc, setDoc, Timestamp, collection, addDoc, getDocs, query, orderBy, limit, updateDoc, arrayUnion, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToastContext } from "@/components/layout/toast-provider";
import Navigation from "@/components/layout/navigation";
import Footer from "@/components/layout/footer";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import { getPlanLabel, planLabels } from "@/lib/plans-data";
import { memberWhatsappLink, planReturnOf } from "@/lib/custom-plans";
import {
  contributionSummary,
  humaniseLastContribution,
  progressPercent,
  remainingToTarget,
} from "@/lib/savings";
import { useCustomPlans } from "@/hooks/use-custom-plans";
import { track } from "@/lib/analytics";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { PlanItem } from "@/lib/types";
import {
  MoveRight,
  Plus,
  CheckCircle2,
  Megaphone,
  Clock,
  RefreshCw,
  MessageCircle,
  PiggyBank,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user, userData, isAdmin, loading, profileLoading, logout, refreshProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToastContext();
  const { customPlans } = useCustomPlans();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [addingPlan, setAddingPlan] = useState(false);

  const addPlanId = searchParams.get("addPlan");
  const userPlans = Array.isArray(userData?.plans) && userData.plans.length > 0
    ? userData.plans
    : userData?.plan
    ? [userData.plan]
    : [];
  const savings = contributionSummary(userData?.contributions ?? []);
  const primaryPlan = userPlans[0];
  const planTarget = primaryPlan ? planReturnOf(primaryPlan, customPlans) : undefined;
  const pct = progressPercent(savings.total, planTarget);
  const remaining = remainingToTarget(savings.total, planTarget);
  const myGroupLink =
    userData?.whatsappLink || memberWhatsappLink(userPlans, customPlans, {});

  // An operator account has no member document; never call her "Member".
  const displayName =
    userData?.name?.split(" ")[0] ||
    user?.displayName?.split(" ")[0] ||
    (isAdmin ? user?.email?.split("@")[0] : "") ||
    "";

  // Announcements may be global (no planId) or targeted at one plan.
  const visibleAnnouncements = announcements
    .filter((a) => !a.planId || userPlans.includes(a.planId))
    .slice(0, 3);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth?mode=signin");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && isAdmin) {
      router.replace("/admin");
    }
  }, [isAdmin, loading, router]);

  const handleAddPlan = async (planId: string) => {
    if (!user) return;
    setAddingPlan(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        plans: arrayUnion(planId)
      });
      addToast(`Plan ${getPlanLabel(planId, customPlans)} added successfully!`, "success");
      router.replace("/dashboard");
    } catch (err) {
      addToast("Failed to add plan.", "error");
    } finally {
      setAddingPlan(false);
    }
  };


  useEffect(() => {
    if (user) {
      const fetchAnnouncements = async () => {
        try {
          const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(10));
          const snap = await getDocs(q);
          setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          // Fallback for projects where announcements lack a createdAt value.
          try {
            const snap = await getDocs(collection(db, "announcements"));
            setAnnouncements(snap.docs.slice(0, 10).map(d => ({ id: d.id, ...d.data() })));
          } catch (fallbackError) {
            console.error("Failed to fetch announcements", e, fallbackError);
          }
        }
      };
      fetchAnnouncements();
    }
  }, [user]);

  if (loading || profileLoading) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    return null;
  }

  // Operators do not get the member hub. Rabi's own login goes straight to her
  // dashboard instead of a "welcome member" screen she has no use for.
  if (isAdmin) {
    router.replace("/admin");
    return <DashboardSkeleton />;
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl text-white mb-2">
              Welcome, <span className="gold-text-gradient">{displayName || "friend"}</span>
            </h1>
            <p className="text-gray-400 text-sm">
              {isAdmin && !userData
                ? "You are signed in as an operator account. Member tools live in the admin dashboard."
                : "Manage your savings and track your progress."}
            </p>
          </div>

          {/* Announcements — Rabi's own notice board (cashout days, reminders).
              A calm default keeps the cashout reminder visible until she posts
              her own, so members always know when money moves. */}
          {visibleAnnouncements.length === 0 && (
            <div className="glass glass-sheen relative mb-8 overflow-hidden rounded-2xl border-amber-300/20 p-5">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-300 via-amber-400/70 to-transparent"
              />
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                    Cashout reminder
                  </p>
                  <h4 className="font-display mt-1 text-lg leading-snug text-white">
                    Cashouts run every Tuesday
                  </h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-300">
                    Rabi confirms your payout in the WhatsApp group. Keep your contributions
                    coming and she will post the exact date here each week.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Announcements — Rabi's own notice board (cashout days, reminders) */}
          {visibleAnnouncements.length > 0 && (
            <div className="mb-8 space-y-3">
              {visibleAnnouncements.map((a, index) => (
                <div
                  key={a.id}
                  className={cn(
                    "glass glass-sheen relative overflow-hidden rounded-2xl p-5",
                    index === 0 && "border-amber-300/25"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-300 via-amber-400/70 to-transparent"
                  />
                  <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                        Announcement
                      </p>
                      <h4 className="font-display mt-1 text-lg leading-snug text-white">{a.title}</h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{a.message}</p>
                      {a.createdAt && (
                        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(a.createdAt, "")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Plan Confirmation */}
          {addPlanId && !userPlans.includes(addPlanId) && (
            <div className="mb-8 p-6 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
              <div className="flex items-center gap-5 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                  <Plus className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Add New Plan?</h3>
                  <p className="text-sm text-gray-400">You are about to add <span className="text-primary font-bold">{getPlanLabel(addPlanId, customPlans)}</span> to your account.</p>
                </div>
              </div>
              <div className="flex gap-3 relative z-10 w-full md:w-auto">
                <Button variant="secondary" size="sm" onClick={() => router.replace("/dashboard")} className="flex-1 md:flex-none">Cancel</Button>
                <Button onClick={() => handleAddPlan(addPlanId)} loading={addingPlan} size="sm" className="flex-1 md:flex-none">
                  Confirm & Join
                </Button>
              </div>
            </div>
          )}

          {/* Profile missing for a real member — recoverable: retry, or reach Rabi */}
          {!userData && !isAdmin && (
            <div className="glass-soft mb-8 rounded-2xl border-amber-400/25 p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white">
                    {user?.emailVerified ? "We can't see your details yet" : "Finish your registration"}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-400">
                    Your login works but your registration has not reached us. This is usually a brief connection
                    problem. Tap <strong className="text-gray-200">Try again</strong>, if it still shows nothing, message
                    Rabi and she will restore your account in minutes.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void refreshProfile()}
                      loading={profileLoading}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" /> Try again
                    </Button>
                    <a
                      href={`https://wa.me/233504701032?text=${encodeURIComponent(
                        `Hello Rabi, my account (${user?.email || ""}) is signed in but my registration is missing. Please help me restore it.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="secondary" size="sm" className="gap-2">
                        <MessageCircle className="h-4 w-4" /> Message support
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Status Banner */}
          {userData && (
            <div className={`mb-8 p-5 rounded-2xl border ${
              userData.status === "approved"
                ? "bg-emerald-900/10 border-emerald-500/20"
                : userData.status === "rejected"
                ? "bg-red-900/10 border-red-500/20"
                : "bg-yellow-900/10 border-yellow-500/20"
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Badge status={userData.status} size="md" />
                  <span className="text-sm text-gray-300">
                    {userData.status === "approved"
                      ? "Your account is verified. Welcome to the community!"
                      : userData.status === "rejected"
                      ? "Your application was not approved. Please contact support."
                      : "Your application is under review. We'll notify you soon."}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Savings tracking. Rabi records every payment she receives; the
              member sees exactly what has landed and how far she has to go. */}
          {userData && (
            <div className="mb-10">
              <section
                aria-label="Savings progress"
                className="glass rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
                      Savings progress
                    </p>
                    <p className="mt-2 font-display text-3xl text-white">
                      GH₵{savings.total.toLocaleString("en-GH")}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {savings.count === 0
                        ? "Rabi records each payment she receives"
                        : `${savings.count} payment${savings.count === 1 ? "" : "s"} · ${humaniseLastContribution(savings.last)}`}
                    </p>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
                    <PiggyBank className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>

                {planTarget ? (
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="text-gray-400">{pct}% of GH₵{planTarget.toLocaleString("en-GH")}</span>
                      <span className="text-emerald-300">
                        {remaining === 0 ? "Target reached" : `GH₵${remaining?.toLocaleString("en-GH")} to go`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] text-gray-400">
                    Your plan has no fixed target, Rabi quotes your payout on WhatsApp.
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                  <div className="min-w-0 rounded-xl bg-black/25 px-3 py-2">
                    <p className="text-gray-500">This month</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-white">
                      GH₵{savings.thisMonth.toLocaleString("en-GH")}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-black/25 px-3 py-2">
                    <p className="text-gray-500">Last 7 days</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-white">
                      GH₵{savings.lastWeek.toLocaleString("en-GH")}
                    </p>
                  </div>
                </div>
              </section>

            </div>
          )}

          {/* My Plans Section */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                My Savings Hub
                <span className="text-xs bg-white/5 px-3 py-1 rounded-full text-gray-500 font-normal">{userPlans.length} Active</span>
              </h2>
              <Button variant="secondary" size="sm" onClick={() => router.push("/#plans")} className="gap-2">
                <Plus className="w-4 h-4" /> Join Another
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userPlans.length > 0 ? userPlans.map((pId) => (
                <Card key={pId} className="group hover:border-primary/40 transition-all duration-300">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <Badge status={userData?.status || "pending"} />
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors mb-2">
                    {getPlanLabel(pId, customPlans)}
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 uppercase tracking-widest font-medium">Active Subscription</p>
                  <a
                    href={
                      memberWhatsappLink([pId], customPlans, {}) ||
                      `https://wa.me/233504701032?text=${encodeURIComponent(
                        `Hello Rabi! I am ${userData?.name || "a member"} and I am on the ${getPlanLabel(pId, customPlans)} plan.`
                      )}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pt-4 border-t border-white/5 flex items-center justify-between text-xs group/link"
                  >
                    <span className="text-primary font-bold group-hover/link:underline">Join the WhatsApp group</span>
                    <MoveRight className="w-4 h-4 text-primary transition-all group-hover/link:translate-x-1" />
                  </a>
                </Card>
              )) : (
                <div className="col-span-full py-12 text-center bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
                   <p className="text-gray-500">No active plans found. Start your journey today!</p>
                   <Button onClick={() => router.push("/#plans")} className="mt-4" size="sm">Browse Plans</Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
            {/* Account Status Card */}
            <Card>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Account Verification</p>
              {userData && <Badge status={userData.status} size="md" />}
            </Card>

            {/* Location Card */}
            <Card>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Primary Location</p>
              <p className="text-sm text-white">{userData?.gpsAddress || userData?.location || "Not set"}</p>
            </Card>
          </div>

          {/* WhatsApp Community */}
          {userData?.status === "approved" && myGroupLink && (
            <Card className="mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-1">Join Your WhatsApp Group</h3>
                  <p className="text-sm text-gray-400">Connect with your savings community and manage your susu contributions.</p>
                </div>
                <a
                  href={myGroupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  Join Group
                </a>
              </div>
            </Card>
          )}

          {/* Profile */}
          <Card className="mb-8">
            <h3 className="text-lg font-bold text-white mb-4">Profile Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Name:</span> <span className="text-white ml-2">{userData?.name}</span></div>
              <div><span className="text-gray-500">Email:</span> <span className="text-white ml-2">{userData?.email}</span></div>
              <div><span className="text-gray-500">Phone:</span> <span className="text-white ml-2">{userData?.phone}</span></div>
              <div><span className="text-gray-500">Main Plan:</span> <span className="text-white ml-2">{getPlanLabel(userData?.plan || "", customPlans)}</span></div>
              <div className="sm:col-span-2"><span className="text-gray-500">All Active Plans:</span> <span className="text-primary ml-2 font-bold">{userPlans.map(p => getPlanLabel(p, customPlans)).join(", ")}</span></div>
            </div>

            {/* Document Thumbnails */}
            {userData && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-sm text-gray-500 mb-3">Submitted Documents</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Ghana Card Front", url: userData.ghanaCardFront },
                    { label: "Ghana Card Back", url: userData.ghanaCardBack },
                    { label: "Passport Photo", url: userData.passportPhoto },
                  ].map((docItem) => (
                    <div key={docItem.label} className="text-center">
                      {docItem.url ? (
                        <Image src={docItem.url} alt={docItem.label} width={200} height={80} className="w-full h-20 object-cover rounded-lg border border-white/10 mb-1" />
                      ) : (
                        <div className="w-full h-20 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center mb-1">
                          <span className="text-xs text-gray-600">N/A</span>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">{docItem.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Submit Review */}
          {userData?.status === "approved" && user && <SubmitReview userData={userData} userId={user.uid} />}
        </div>
      </main>
      <Footer />
    </>
  );
}

function SubmitReview({ userData, userId }: { userData: { name: string; passportPhoto: string; plan: string }; userId: string }) {
  const { addToast } = useToastContext();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!review.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "testimonials"), {
        userId,
        userName: userData.name,
        userPhoto: userData.passportPhoto,
        planName: planLabels[userData.plan] || userData.plan,
        rating,
        review: review.trim(),
        status: "pending",
        isStatic: false,
        createdAt: Timestamp.now(),
      });
      addToast("Review submitted! It will appear after admin approval.", "success");
      setSubmitted(true);
    } catch {
      addToast("Failed to submit review.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <div className="text-center py-4">
          <svg className="w-10 h-10 text-emerald-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-white font-bold mb-1">Thank You!</p>
          <p className="text-sm text-gray-400">Your review has been submitted for approval.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-bold text-white mb-4">Share Your Experience</h3>

      {/* Star Rating */}
      <div className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            className="cursor-pointer transition-transform hover:scale-110"
          >
            <svg
              className={`w-7 h-7 ${star <= rating ? "text-primary" : "text-gray-700"}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        ))}
      </div>

      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder="Tell others about your experience with Rabi's Saving Hub..."
        className="w-full px-4 py-3 bg-navy-dark/60 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none h-24"
        maxLength={500}
      />
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-500">{review.length}/500</span>
        <Button onClick={handleSubmit} loading={loading} size="sm" disabled={!review.trim()}>
          Submit Review
        </Button>
      </div>
    </Card>
  );
}
