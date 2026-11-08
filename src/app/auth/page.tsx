"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  signOut,
} from "firebase/auth";

import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { useToastContext } from "@/components/layout/toast-provider";
import { useAuth } from "@/context/auth-context";
import { useGeolocation } from "@/hooks/use-geolocation";
import { getPlanLabel } from "@/lib/plans-data";
import { Check, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useCustomPlans } from "@/hooks/use-custom-plans";
import { track } from "@/lib/analytics";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import ErrorBoundary from "@/components/ui/error-boundary";
import ImageUpload from "@/components/ui/image-upload";
import PlanPicker from "@/components/ui/plan-picker";
import type { DocVerdict } from "@/lib/kyc-verification";
/*
 * FaceScan used to be a separate lazy chunk. On a phone that is holding a cached
 * page from a previous deploy, that chunk name no longer exists, the import
 * rejects, and step three dies before the member can tap. The component itself is
 * small; its heavy parts (three.js and MediaPipe) load lazily from inside it. So it
 * ships with the page and there is no second chance to 404.
 */
import FaceScan from "@/components/ui/face-scan";
import Navigation from "@/components/layout/navigation";
import { formatGhanaCardInput, validateGhanaCardFormat } from "@/lib/ghana-card";
import { isValidGhanaPhone, normalizeGhanaPhone } from "@/lib/phone";
import { requestNewMemberAlert } from "@/lib/notify-client";
import type { RegistrationData } from "@/lib/types";

export default function AuthPage() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen flex items-center justify-center pt-24 pb-16 px-4">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        }>
          <AuthContent />
        </Suspense>
      </main>
    </>
  );
}

function AuthContent() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const mode = params.get("mode") || "signup";
  const [isSignup, setIsSignup] = useState(mode === "signup");


  useEffect(() => {
    setIsSignup(mode === "signup");
  }, [mode]);

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) return null;

  return (
    <div className="w-full max-w-md">
      {!isFirebaseConfigured && (
        <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-bold mb-1">Firebase is not configured</p>
          <p className="text-amber-200/80">
            Sign-up and sign-in cannot work until the <code>NEXT_PUBLIC_FIREBASE_*</code> environment
            variables are set (see <code>.env.example</code>). You can still browse the site.
          </p>
        </div>
      )}
      {isSignup ? (
        <SignupForm onSwitch={() => router.push("/auth?mode=signin")} />
      ) : (
        <SigninForm onSwitch={() => router.push("/auth?mode=signup")} />
      )}
    </div>
  );
}

function SigninForm({ onSwitch }: { onSwitch: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      addToast("Firebase isn't configured yet, so sign-in is unavailable.", "error");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      addToast("Welcome back!", "success");
      router.push("/dashboard");
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message =
        code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
          ? "Incorrect email or password."
          : code === "auth/too-many-requests"
          ? "Too many attempts. Please wait a moment and try again."
          : code === "auth/network-request-failed"
          ? "Network error. Check your internet connection."
          : err instanceof Error
          ? err.message
          : "Login failed";
      addToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      addToast("Enter your email address first.", "error");
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      addToast("Password reset link sent. Check your inbox.", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Could not send reset email", "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl text-white mb-2">Welcome Back</h1>
        <p className="text-sm text-gray-400">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" loading={loading} disabled={!isFirebaseConfigured} className="w-full">
          Sign In
        </Button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="w-full text-center text-xs text-gray-400 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
        >
          {resetting ? "Sending reset link…" : "Forgot your password?"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-400 mt-6">
        Don&apos;t have an account?{" "}
        <button onClick={onSwitch} className="text-primary hover:underline cursor-pointer">Create one</button>
      </p>
    </div>
  );
}

function SignupForm({ onSwitch }: { onSwitch: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const { addToast } = useToastContext();
  const {
    status: gpsStatus,
    gpsData,
    error: gpsError,
    failureCode: gpsFailure,
    attempts: gpsAttempts,
    requestLocation,
    skip: skipLocation,
  } = useGeolocation();

  /*
   * The typed area used to be the first thing a member saw on the location
   * step, which made the whole step look like a form to fill in by hand. It now
   * appears only after the phone has genuinely failed three times, or when the
   * member chooses it.
   */
  const [showManualArea, setShowManualArea] = useState(false);

  useEffect(() => {
    if (gpsAttempts >= 3) setShowManualArea(true);
  }, [gpsAttempts]);
  const [step, setStep] = useState(1);
  /*
   * Storage can fail for reasons that are nobody's fault on this phone: a
   * misconfigured key, a Cloudinary account over quota, a blocked network. A
   * member must never be trapped at step two because of it, so one failed upload
   * unlocks a WhatsApp handover path that Rabi can finish herself.
   */
  const [uploadFailures, setUploadFailures] = useState(0);
  const [sendDocsOnWhatsApp, setSendDocsOnWhatsApp] = useState(false);

  // Signup funnel — the admin Insights tab and PostHog both read this.
  useEffect(() => {
    track("signup_step_view", { step });
  }, [step]);
  const [loading, setLoading] = useState(false);
  const { customPlans } = useCustomPlans();
  /*
   * The card reader's own number, and what the member typed over it. The reader
   * is the honest witness here: if the field and the card disagree, Rabi has to
   * be told, because that is exactly how a swapped card gets through.
   */

  const [docVerdicts, setDocVerdicts] = useState<
    Partial<Record<"front" | "back" | "selfie", DocVerdict | null>>
  >({});
  const [livenessMode, setLivenessMode] = useState<"video" | "manual_review" | null>(null);

  // Math Captcha State
  const [mathObj, setMathObj] = useState({ a: 0, b: 0 });
  const [mathAns, setMathAns] = useState("");
  const [mathError, setMathError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const mathInputRef = useRef<HTMLInputElement>(null);

  /** Ask a fresh question. Called on mount and after every wrong answer. */
  const newMathQuestion = useCallback(() => {
    setMathObj({ a: Math.floor(Math.random() * 5) + 1, b: Math.floor(Math.random() * 5) + 1 });
    setMathAns("");
  }, []);

  useEffect(() => {
    newMathQuestion();
  }, [newMathQuestion]);

  // Handle planId from URL
  useEffect(() => {
    const planId = params.get("planId");
    if (planId) {
      update("plan", planId);
    }
  }, [params]);

  const [form, setForm] = useState<RegistrationData>({
    firstName: "", lastName: "", email: "", phone: "", location: "", password: "",
    plan: "", ghanaCardNumber: "", ghanaCardValid: false, ghanaCardFront: "", ghanaCardBack: "", passportPhoto: "",
    gpsLat: 0, gpsLng: 0, gpsAddress: "",
  });

  const update = (key: keyof RegistrationData, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  const passwordValid = form.password.length >= 6;
  const phoneValid = isValidGhanaPhone(form.phone);
  const canStep2 =
    Boolean(form.firstName.trim() && form.lastName.trim() && form.phone.trim() && form.plan) &&
    emailValid &&
    passwordValid &&
    phoneValid;
  const frontReady = Boolean(form.ghanaCardFront);
  const backReady = Boolean(form.ghanaCardBack);
  // The uploaded image is only evidence for a human reviewer; browser face
  // detection cannot certify identity or liveness.
  const selfieReady = Boolean(form.passportPhoto);
  const documentsReady = frontReady && backReady && selfieReady;
  const documentsDeferred = uploadFailures > 0 && sendDocsOnWhatsApp;
  const canStep3 = Boolean(form.ghanaCardNumber && form.ghanaCardValid && (documentsReady || documentsDeferred));
  const canStep4 = Boolean(form.faceScanVideo) || livenessMode === "manual_review";
  const mathPassed = mathAns.trim() === (mathObj.a + mathObj.b).toString();

  const handleFaceScanComplete = useCallback((url: string) => {
    setForm((prev) => ({ ...prev, faceScanVideo: url }));
  }, []);

  const goToStep3 = useCallback(() => setStep(3), []);

  const handleSubmit = async () => {
    /*
     * The button used to be disabled while the answer was wrong, so a wrong
     * answer looked like a dead button: no message, no reset, nothing. Now the
     * press always produces an answer, and a wrong one says so in red, clears
     * the field and asks a new question.
     */
    if (!mathPassed) {
      setMathError("Incorrect answer, please try again.");
      newMathQuestion();
      requestAnimationFrame(() => mathInputRef.current?.focus());
      return;
    }

    if (!termsAccepted) {
      setMathError(null);
      addToast("Please tick the box to accept the Susu rules before continuing.", "error");
      return;
    }

    setMathError(null);

    if (!isFirebaseConfigured) {
      addToast("Firebase isn't configured yet, so accounts cannot be created.", "error");
      return;
    }
    if (!emailValid || !passwordValid) {
      addToast("Please use a valid email and a password with at least 6 characters.", "error");
      setStep(1);
      return;
    }
    setLoading(true);
    let createdUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"] | null = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      createdUser = cred.user;
      const secureSubmission = await fetch("/api/signup/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await cred.user.getIdToken()}`,
        },
        body: JSON.stringify({
          name: `${form.firstName} ${form.lastName}`,
          email: form.email.trim(),
          phone: normalizeGhanaPhone(form.phone),
          location: form.location,
          plan: form.plan,
          ghanaCardNumber: form.ghanaCardNumber || "",
          ghanaCardFront: form.ghanaCardFront || "",
          ghanaCardBack: form.ghanaCardBack || "",
          passportPhoto: form.passportPhoto || "",
          faceScanVideo: form.faceScanVideo || "",
          documentsDeferred,
          gpsLat: gpsData?.lat ?? 0,
          gpsLng: gpsData?.lng ?? 0,
          gpsAddress: gpsData?.address || (form.location ? `${form.location} (typed by the member)` : "Unknown, pending"),
          locationSource: gpsData ? gpsData.source : form.location ? "manual" : "unknown",
          locationAccuracy: gpsData?.accuracy ?? null,
          locationReview: !gpsData || gpsData.suspicious,
          termsAccepted: true,
        }),
      });
      if (!secureSubmission.ok) {
        const result = await secureSubmission.json().catch(() => ({}));
        throw new Error(typeof result.error === "string" ? result.error : "Secure application submission failed");
      }

      /*
       * Tell Rabi somebody applied.
       *
       * The request carries the new member's ID token and nothing else: the
       * server reads name, phone and plan from the record it just created, so an
       * alert cannot describe an application that does not exist. `keepalive`
       * keeps it alive across the redirect to the dashboard, and if it is lost
       * anyway the pending queue in /admin still shows this application.
       */
      void requestNewMemberAlert(undefined, { keepalive: true });

      addToast("Account created! Your application is under review.", "success");
      router.push("/dashboard");
    } catch (err) {
      // Never leave a half-registered auth account behind: without a users doc
      // the dashboard would be permanently empty for that login.
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch {
          await signOut(auth);
        }
      }
      const message = err instanceof Error ? err.message : "Registration failed";
      addToast(
        message.includes("permission-denied")
          ? "We could not save your profile (Firestore rules blocked the write), so the account was rolled back. Please try again or contact support."
          : message,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
      <div className="text-center mb-6">
        <h1 className="font-display text-2xl text-white mb-2">Join Rabi&apos;s Saving Hub</h1>
        <p className="text-sm text-gray-400">Step {step} of 5</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? "bg-primary" : "bg-gray-700"}`} />
        ))}
      </div>

      {/* STEP 1 — Personal */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
            <Input label="Last Name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          <Input
            label="Phone / MoMo Number"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            onBlur={(e) => {
              if (isValidGhanaPhone(e.target.value)) update("phone", normalizeGhanaPhone(e.target.value));
            }}
            placeholder="050 470 1032"
            error={form.phone.length > 3 && !phoneValid ? "Enter a valid Ghana number (e.g. 050 470 1032)." : undefined}
            required
          />
          <Input label="Location (Area)" value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Madina, Accra" />
          <Input
            label="Password (min. 6 characters)"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            error={form.password.length > 0 && !passwordValid ? "Password must be at least 6 characters." : undefined}
            required
          />

          <PlanPicker
            value={form.plan}
            onChange={(planId) => update("plan", planId)}
            customPlans={customPlans}
          />

          <Button onClick={() => setStep(2)} disabled={!canStep2} className="w-full">
            Continue
          </Button>
        </div>
      )}

      {/* STEP 2 — Documents */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <p className="text-[11px] leading-relaxed text-gray-400">
              Your card number must match the photo. Images are checked on your device before they are
              uploaded, then reviewed by Rabi before your account is approved.
            </p>
          </div>

          <div className="relative">
            <Input
              label="Ghana Card Number (GHA-XXXXXXXXX-X)"
              value={form.ghanaCardNumber || ""}
              onChange={(e) => {
                const formatted = formatGhanaCardInput(e.target.value);
                const isValid = validateGhanaCardFormat(formatted);
                setForm((prev) => ({ ...prev, ghanaCardNumber: formatted, ghanaCardValid: isValid }));
              }}
              placeholder="GHA-123456789-0"
              required
            />
            {form.ghanaCardNumber && form.ghanaCardNumber.length > 3 && (
              <div className="absolute right-3 top-9">
                {form.ghanaCardValid ? (
                  <span className="font-bold text-emerald-400">✓</span>
                ) : (
                  <span className="text-xs font-bold uppercase tracking-widest text-red-400">Invalid</span>
                )}
              </div>
            )}
          </div>

          <ImageUpload
            label="Ghana Card, Front"
            value={form.ghanaCardFront}
            verify="id-front"
            hint="Lay the card flat on a table, all four corners inside the frame, no glare."
            onUpload={(url) => update("ghanaCardFront", url)}
            onFailure={() => setUploadFailures((count) => count + 1)}
            onVerdict={(verdict) => {
              setDocVerdicts((prev) => ({ ...prev, front: verdict }));
              if (verdict) update("ghanaCardOcrResult", JSON.stringify(verdict));
            }}
          />

          <ImageUpload
            label="Ghana Card, Back"
            value={form.ghanaCardBack}
            verify="id-back"
            hint="Flip the card over, the barcode side. Keep the whole card in frame."
            onUpload={(url) => update("ghanaCardBack", url)}
            onFailure={() => setUploadFailures((count) => count + 1)}
            onVerdict={(verdict) => {
              setDocVerdicts((prev) => ({ ...prev, back: verdict }));
            }}
          />

          <ImageUpload
            label="Passport Photo / Selfie"
            value={form.passportPhoto}
            verify="selfie"
            hint="Head and shoulders, good light, only you in the photo."
            onUpload={(url) => update("passportPhoto", url)}
            onFailure={() => setUploadFailures((count) => count + 1)}
            onVerdict={(verdict) => {
              setDocVerdicts((prev) => ({ ...prev, selfie: verdict }));
            }}
          />





          {uploadFailures > 0 && !documentsReady && (
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.08] p-4">
              <p className="text-sm font-semibold text-amber-200">Photos could not be uploaded</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                We tried {uploadFailures === 1 ? "once" : `${uploadFailures} times`} and storage refused the file.
                Nothing is wrong with your phone. You can still finish now and send the same photos to Rabi on
                WhatsApp, she will attach them to your application herself.
              </p>
              <label className="mt-3 flex items-start gap-2.5 text-xs text-amber-100">
                <input
                  type="checkbox"
                  checked={sendDocsOnWhatsApp}
                  onChange={(event) => setSendDocsOnWhatsApp(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-black/40 accent-amber-400"
                />
                <span className="min-w-0">
                  I will send my Ghana Card and selfie to Rabi on WhatsApp so she can verify me.
                </span>
              </label>
            </div>
          )}

          <div className="glass-soft rounded-2xl p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              Document status
            </p>
            <div className="divide-y divide-white/5">
              {([
                ["Card front", docVerdicts.front, Boolean(form.ghanaCardFront)],
                ["Card back", docVerdicts.back, Boolean(form.ghanaCardBack)],
                ["Selfie", docVerdicts.selfie, Boolean(form.passportPhoto)],
              ] as const).map(([label, verdict, uploaded]) => (
                <div key={label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-gray-400">{label}</span>
                  {!uploaded ? (
                    <span className="text-[11px] text-gray-400">Not uploaded</span>
                  ) : verdict?.status === "verified" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                      <Check className="h-3 w-3" /> Verified
                    </span>
                  ) : verdict?.status === "rejected" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-300">
                      <TriangleAlert className="h-3 w-3" /> Rejected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                      <TriangleAlert className="h-3 w-3" /> Admin review
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
              Back
            </Button>
            <Button onClick={goToStep3} disabled={!canStep3} className="flex-1">
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — Liveness Face Scan */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="text-center">
            <h2 className="font-display text-lg text-white">Optional face scan</h2>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-gray-400">
              This may help Rabi review your application. Browser face checks are not certified liveness or proof of identity; your application stays pending for human review.
            </p>
          </div>

          {/*
            The camera, the WebGL panel and the face model all live inside this
            step, and any of them can fail on a real phone: no camera permission,
            no WebGL2, too many tabs holding a GPU context, a chunk that will not
            download on 3G. Letting that unwind to the app error page threw away a
            form the member had already filled in, so the step degrades to manual
            review instead and the signup keeps moving.
          */}
          <ErrorBoundary
            label="face-scan"
            fallback={(error, reset) => (
              <div className="glass-soft space-y-3 rounded-2xl p-5 text-center">
                <p className="text-sm font-semibold text-white">The camera check could not open on this phone</p>
                <p className="text-[11px] leading-relaxed text-gray-400">
                  Your documents are safe and nothing is lost. Try again, or let Rabi verify you manually on
                  WhatsApp and finish the rest of the signup right now.
                </p>
                <div className="space-y-2">
                  <Button onClick={reset} variant="secondary" className="w-full">
                    Try the camera again
                  </Button>
                  <Button
                    onClick={() => {
                      setLivenessMode("manual_review");
                      update("faceScanVideo", "");
                      addToast("No problem, Rabi will verify you manually.", "info");
                    }}
                    className="w-full"
                  >
                    Continue with manual review
                  </Button>
                </div>
                <p className="break-words text-[10px] leading-relaxed text-gray-400">
                  Reason: {error?.message || error?.name || "unknown"}. Send this line to Rabi if it keeps happening.
                </p>
              </div>
            )}
          >
            <FaceScan
              onComplete={handleFaceScanComplete}
              onManualReview={() => {
                setLivenessMode("manual_review");
                update("faceScanVideo", "");
                addToast("No problem, Rabi will verify you manually.", "info");
              }}
            />
          </ErrorBoundary>

          {livenessMode === "manual_review" && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              Manual review requested. You can continue, your account stays pending until Rabi confirms
              your identity.
            </p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">
              Back
            </Button>
            <Button onClick={() => setStep(4)} disabled={!canStep4} className="flex-1">
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4 — Location. Helpful, never a gate. */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Enable Your Location</h3>
            <p className="text-sm text-gray-300 mb-6">
              A GPS pin helps Rabi confirm you are in Ghana. If your phone cannot find you, type your area below and continue.
            </p>

            {gpsStatus === "idle" && (
              <div className="space-y-3">
                <Button onClick={requestLocation} className="w-full">Detect My Location</Button>
                <button
                  type="button"
                  onClick={skipLocation}
                  className="text-xs text-gray-300 underline underline-offset-4 hover:text-white"
                >
                  Skip, I will type my area
                </button>
              </div>
            )}

            {gpsStatus === "detecting" && (
              <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-gray-300">Finding you. Indoors this can take up to 20 seconds.</p>
                <button
                  type="button"
                  onClick={skipLocation}
                  className="text-xs text-gray-300 underline underline-offset-4 hover:text-white"
                >
                  Skip for now
                </button>
              </div>
            )}

            {gpsStatus === "success" && gpsData && (
              <div
                className={`rounded-xl p-4 text-left border ${
                  gpsData.suspicious
                    ? "bg-amber-500/10 border-amber-400/30"
                    : "bg-emerald-900/20 border-emerald-500/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg className={`w-5 h-5 ${gpsData.suspicious ? "text-amber-300" : "text-emerald-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={gpsData.suspicious ? "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" : "M5 13l4 4L19 7"} />
                  </svg>
                  <span className={`text-sm font-semibold ${gpsData.suspicious ? "text-amber-200" : "text-emerald-300"}`}>
                    {gpsData.suspicious ? "Location needs a check" : "Location detected"}
                  </span>
                </div>
                <p className="text-sm text-gray-200">{gpsData.address}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Accurate to about {gpsData.accuracy} m, from {gpsData.source === "gps" ? "GPS" : "your network"}
                </p>
                {gpsData.suspicious && (
                  <p className="text-xs text-amber-200/90 mt-2">
                    We could not confirm this pin is in Ghana. You can continue, and Rabi will check your address.
                  </p>
                )}
                <button
                  type="button"
                  onClick={requestLocation}
                  className="mt-3 text-xs text-gray-300 underline underline-offset-4 hover:text-white"
                >
                  Detect again
                </button>
              </div>
            )}

            {(gpsStatus === "denied" || gpsStatus === "unavailable") && (
              <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 text-left">
                <p className="text-sm text-amber-100">
                  {gpsError || "We could not get your exact GPS location. You can proceed, but Rabi may ask for your address later."}
                </p>
                {gpsFailure === "denied" && (
                  <p className="text-xs text-amber-200/90 mt-2">
                    Tap the lock icon next to the address bar, set Location to Allow, then try again.
                  </p>
                )}
                <Button variant="secondary" onClick={requestLocation} className="w-full mt-4">
                  Try Again
                </Button>
              </div>
            )}

            {gpsAttempts > 0 && gpsAttempts < 3 && gpsStatus !== "success" && (
              <p className="mt-4 text-xs text-gray-400">Attempt {gpsAttempts} of 3</p>
            )}

            {showManualArea ? (
            <div className="mt-6 text-left">
              <p className="mb-2 text-sm text-amber-100">
                We couldn&apos;t detect your location. Please type your area below.
              </p>
              <label
                htmlFor="signup-area"
                className="block text-xs font-semibold uppercase tracking-widest text-gray-300 mb-2"
              >
                Your area
              </label>
              <input
                id="signup-area"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="e.g. Kpormetey, Accra"
                autoComplete="address-level2"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-400 focus:border-primary focus:outline-none"
              />
              <p className="mt-2 text-xs text-gray-400">
                Rabi reads this herself, so spell it the way a neighbour would say it.
              </p>
            </div>
            ) : null}
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(3)} className="flex-1">Back</Button>
            <Button onClick={() => setStep(5)} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {/* STEP 5 — Confirmation */}
      {step === 5 && (
        <div className="space-y-5">
          <div className="bg-white/[0.03] rounded-xl p-4 space-y-2 text-sm">
            <p className="text-gray-400">Name: <span className="text-white">{form.firstName} {form.lastName}</span></p>
            <p className="text-gray-400">Email: <span className="text-white">{form.email}</span></p>
            <p className="text-gray-400">Phone: <span className="text-white">{form.phone}</span></p>
            <p className="text-gray-400">Plan: <span className="text-white">{getPlanLabel(form.plan, customPlans)}</span></p>
            <p className="text-gray-400">Location: <span className="text-white">{gpsData?.address || form.location || "To be confirmed"}</span></p>
            <p className="text-gray-400">Documents: <span className="text-emerald-400">3 uploaded + Verified Face Scan</span></p>
          </div>

          <div className="bg-[#051A10]/60 border border-[#065F46] rounded-xl p-5 mt-4">
            <h3 className="text-white font-bold mb-2">Human Verification</h3>
            <p className="text-gray-400 text-sm mb-3">For security, please solve this quick math problem.</p>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold font-display text-primary">{mathObj.a} + {mathObj.b} = </span>
              <input
                ref={mathInputRef}
                type="number"
                inputMode="numeric"
                value={mathAns}
                aria-label="Answer to the verification question"
                aria-invalid={mathError ? true : undefined}
                aria-describedby={mathError ? "math-error" : undefined}
                onChange={(e) => {
                  setMathAns(e.target.value);
                  if (mathError) setMathError(null);
                }}
                className={`w-24 px-3 py-2 bg-[#020c06] border rounded-lg text-white font-bold focus:outline-none transition-colors ${
                  mathError ? "border-red-500/70 focus:border-red-400" : "border-[#065F46] focus:border-primary"
                }`}
                placeholder="?"
              />
            </div>
            {mathError && (
              <p id="math-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-red-400">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {mathError}
              </p>
            )}
          </div>

          <label className="flex items-start gap-4 cursor-pointer mt-4 bg-primary/5 p-4 rounded-xl border border-primary/20">
            <input type="checkbox" id="terms" className="mt-1 accent-primary w-5 h-5 flex-shrink-0" required checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
            <span className="text-sm text-gray-300 leading-relaxed">
              I, <strong className="text-primary tracking-wide text-base">{form.firstName || "[Name]"} {form.lastName || ""}</strong>, agree to join Rabi&apos;s Saving Hub. I confirm that I will abide by the strict Susu rules, understand that funds are non-refundable, and will fill out all mandatory forms before any cashout.
            </span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep(4)} className="flex-1">Back</Button>
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={!isFirebaseConfigured}
              className="flex-1"
            >
              Create Account
            </Button>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-gray-400 mt-6">
        Already have an account?{" "}
        <button onClick={onSwitch} className="text-primary hover:underline cursor-pointer">Sign in</button>
      </p>
    </div>
  );
}
