"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useToastContext } from "@/components/layout/toast-provider";
import { useGeolocation } from "@/hooks/use-geolocation";
import { getPlanOptions } from "@/lib/plans-data";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { getDoc } from "firebase/firestore";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import ImageUpload from "@/components/ui/image-upload";
import Navigation from "@/components/layout/navigation";
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
  const params = useSearchParams();
  const mode = params.get("mode") || "signup";
  const [isSignup, setIsSignup] = useState(mode === "signup");

  return (
    <div className="w-full max-w-md">
      {isSignup ? (
        <SignupForm onSwitch={() => setIsSignup(false)} />
      ) : (
        <SigninForm onSwitch={() => setIsSignup(true)} />
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      addToast("Welcome back!", "success");
      router.push("/dashboard");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Login failed", "error");
    } finally {
      setLoading(false);
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
        <Button type="submit" loading={loading} className="w-full">
          Sign In
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Don&apos;t have an account?{" "}
        <button onClick={onSwitch} className="text-primary hover:underline cursor-pointer">Create one</button>
      </p>
    </div>
  );
}

function SignupForm({ onSwitch }: { onSwitch: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const { status: gpsStatus, gpsData, error: gpsError, requestLocation } = useGeolocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [customPlans, setCustomPlans] = useState<any[]>([]);
  const basePlanOptions = getPlanOptions();

  // Fetch customizable plans from Admin
  useEffect(() => {
    async function loadCustomPlans() {
      try {
        const snap = await getDoc(doc(db, "settings", "customPlans"));
        if (snap.exists() && snap.data().plans) {
          setCustomPlans(snap.data().plans);
        }
      } catch (err) {
        console.error("Error loading custom plans:", err);
      }
    }
    loadCustomPlans();
  }, []);

  const [form, setForm] = useState<RegistrationData>({
    firstName: "", lastName: "", email: "", phone: "", location: "", password: "",
    plan: "", ghanaCardFront: "", ghanaCardBack: "", passportPhoto: "",
    gpsLat: 0, gpsLng: 0, gpsAddress: "",
  });

  const update = (key: keyof RegistrationData, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canStep2 = form.firstName && form.lastName && form.email && form.phone && form.password && form.plan;
  const canStep3 = form.ghanaCardFront && form.ghanaCardBack && form.passportPhoto;
  const canStep4 = gpsStatus === "success";

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        name: `${form.firstName} ${form.lastName}`,
        email: form.email,
        phone: form.phone,
        location: form.location,
        plan: form.plan,
        ghanaCardFront: form.ghanaCardFront,
        ghanaCardBack: form.ghanaCardBack,
        passportPhoto: form.passportPhoto,
        gpsLat: gpsData?.lat || 0,
        gpsLng: gpsData?.lng || 0,
        gpsAddress: gpsData?.address || "",
        status: "pending",
        whatsappLink: "",
        createdAt: Timestamp.now(),
      });
      addToast("Account created! Your application is under review.", "success");
      router.push("/dashboard");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Registration failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
      <div className="text-center mb-6">
        <h1 className="font-display text-2xl text-white mb-2">Join Rabi&apos;s Saving Hub</h1>
        <p className="text-sm text-gray-400">Step {step} of 4</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {[1, 2, 3, 4].map((s) => (
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
          <Input label="Phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+233..." required />
          <Input label="Location (Area)" value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Madina, Accra" />
          <Input label="Password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required />

          {/* Plan Select */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Choose a Plan</label>
            <select
              value={form.plan}
              onChange={(e) => update("plan", e.target.value)}
              className="w-full px-4 py-3 bg-navy-dark/60 border border-gray-700 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer"
              required
            >
              <option value="">Select a plan...</option>
              {customPlans.length > 0 && (
                <optgroup label="🌟 New Custom Plans (Admin)">
                  {customPlans.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name} ({opt.freq} - Target: GH₵{opt.ret})</option>
                  ))}
                </optgroup>
              )}
              {basePlanOptions.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <Button onClick={() => setStep(2)} disabled={!canStep2} className="w-full">
            Continue
          </Button>
        </div>
      )}

      {/* STEP 2 — Documents */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-400 mb-2">Upload clear photos of your identification documents.</p>
          <ImageUpload label="Ghana Card (Front)" value={form.ghanaCardFront} onUpload={(url) => update("ghanaCardFront", url)} />
          <ImageUpload label="Ghana Card (Back)" value={form.ghanaCardBack} onUpload={(url) => update("ghanaCardBack", url)} />
          <ImageUpload label="Passport Photo / Clear Selfie" value={form.passportPhoto} onUpload={(url) => update("passportPhoto", url)} />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">Back</Button>
            <Button onClick={() => setStep(3)} disabled={!canStep3} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {/* STEP 3 — GPS Location (MANDATORY) */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Enable Your Location</h3>
            <p className="text-sm text-gray-400 mb-6">
              We need your GPS location for verification. This is <span className="text-primary font-semibold">required</span> to complete registration.
            </p>

            {gpsStatus === "idle" && (
              <Button onClick={requestLocation} className="w-full">
                Detect My Location
              </Button>
            )}

            {gpsStatus === "detecting" && (
              <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-gray-400">Detecting your location...</p>
              </div>
            )}

            {gpsStatus === "success" && gpsData && (
              <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-emerald-300">Location Detected</span>
                </div>
                <p className="text-sm text-gray-300">{gpsData.address}</p>
                <p className="text-xs text-gray-500 mt-1">
                  GPS: {gpsData.lat.toFixed(6)}, {gpsData.lng.toFixed(6)}
                </p>
              </div>
            )}

            {(gpsStatus === "denied" || gpsStatus === "error") && (
              <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-4">
                <p className="text-sm text-red-300 mb-3">{gpsError}</p>
                <p className="text-xs text-gray-500 mb-4">
                  Please enable location access in your browser settings and try again.
                </p>
                <Button variant="danger" onClick={requestLocation} className="w-full">
                  Try Again
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">Back</Button>
            <Button onClick={() => setStep(4)} disabled={!canStep4} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {/* STEP 4 — Confirmation */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="bg-white/[0.03] rounded-xl p-4 space-y-2 text-sm">
            <p className="text-gray-400">Name: <span className="text-white">{form.firstName} {form.lastName}</span></p>
            <p className="text-gray-400">Email: <span className="text-white">{form.email}</span></p>
            <p className="text-gray-400">Phone: <span className="text-white">{form.phone}</span></p>
            <p className="text-gray-400">Plan: <span className="text-white">{form.plan}</span></p>
            <p className="text-gray-400">Location: <span className="text-white">{gpsData?.address}</span></p>
            <p className="text-gray-400">Documents: <span className="text-emerald-400">3 uploaded</span></p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" id="terms" className="mt-1 accent-primary cursor-pointer" required />
            <span className="text-sm text-gray-400">
              I agree to the <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</a> and <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>, and understand that my Susu contributions will be managed through WhatsApp.
            </span>
          </label>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(3)} className="flex-1">Back</Button>
            <Button onClick={handleSubmit} loading={loading} className="flex-1">
              Create Account
            </Button>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{" "}
        <button onClick={onSwitch} className="text-primary hover:underline cursor-pointer">Sign in</button>
      </p>
    </div>
  );
}
