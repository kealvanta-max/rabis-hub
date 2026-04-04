"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { doc, setDoc, Timestamp, collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToastContext } from "@/components/layout/toast-provider";
import Navigation from "@/components/layout/navigation";
import Footer from "@/components/layout/footer";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import { planLabels } from "@/lib/plans-data";

export default function DashboardPage() {
  const { user, userData, loading, logout } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // Effect handles redirecting cleanly
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth?mode=signin");
    }
  }, [user, loading, router]);

  // Don't render until we are absolutely sure the user exists and data is loaded.
  if (!user && !loading) {
    return null;
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl text-white mb-2">
              Welcome, <span className="gold-text-gradient">{userData?.name?.split(" ")[0] || "Member"}</span>
            </h1>
            <p className="text-gray-400 text-sm">Manage your savings and track your progress.</p>
          </div>

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

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {/* Plan Card */}
            <Card>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active Plan</p>
              <p className="text-xl font-bold text-white">
                {userData?.plan ? planLabels[userData.plan] || userData.plan : "—"}
              </p>
            </Card>

            {/* Status Card */}
            <Card>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Account Status</p>
              {userData && <Badge status={userData.status} size="md" />}
            </Card>

            {/* Location Card */}
            <Card>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Location</p>
              <p className="text-sm text-white">{userData?.gpsAddress || userData?.location || "Not set"}</p>
            </Card>
          </div>

          {/* WhatsApp Community */}
          {userData?.status === "approved" && userData.whatsappLink && (
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
                  href={userData.whatsappLink}
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
              <div><span className="text-gray-500">Plan:</span> <span className="text-white ml-2">{planLabels[userData?.plan || ""] || userData?.plan}</span></div>
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
                  ].map((doc) => (
                    <div key={doc.label} className="text-center">
                      {doc.url ? (
                        <img src={doc.url} alt={doc.label} className="w-full h-20 object-cover rounded-lg border border-white/10 mb-1" />
                      ) : (
                        <div className="w-full h-20 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center mb-1">
                          <span className="text-xs text-gray-600">N/A</span>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">{doc.label}</p>
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
