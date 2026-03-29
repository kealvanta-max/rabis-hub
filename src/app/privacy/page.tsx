"use client";

import Navigation from "@/components/layout/navigation";
import Footer from "@/components/layout/footer";

export default function PrivacyPolicyPage() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen pt-28 pb-20 px-4">
        <article className="max-w-3xl mx-auto prose-container">
          <h1 className="font-display text-3xl md:text-4xl text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: 28 March 2026</p>

          <div className="space-y-8 text-gray-300 text-[15px] leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Who We Are</h2>
              <p>
                Rabi&apos;s Saving Hub is a savings community platform based in Accra, Ghana. We help everyday Ghanaians grow their money through structured Susu saving plans. When you sign up with us, we become responsible for keeping your personal information safe, and we take that responsibility seriously.
              </p>
              <p className="mt-3">
                If you ever have questions about how we handle your data, you can reach us directly on WhatsApp at <a href="https://wa.me/233504701032" className="text-primary hover:underline">+233 504 701 032</a> or call us at <a href="tel:+233244990995" className="text-primary hover:underline">+233 244 990 995</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">What Information We Collect</h2>
              <p>We only ask for information that we genuinely need to verify your identity and manage your savings. Here is exactly what we collect and why:</p>

              <div className="mt-4 space-y-4">
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">Personal Details</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-400">
                    <li><span className="text-gray-300">Full name</span> — so we know who you are and can address you properly</li>
                    <li><span className="text-gray-300">Email address</span> — for your account login and important notifications</li>
                    <li><span className="text-gray-300">Phone number</span> — to reach you about your savings and add you to the right WhatsApp group</li>
                    <li><span className="text-gray-300">Location / Area</span> — to understand where our members are based</li>
                  </ul>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">Identity Documents</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-400">
                    <li><span className="text-gray-300">Ghana Card (front and back)</span> — to verify your identity before we approve your account</li>
                    <li><span className="text-gray-300">Passport-style photo or clear selfie</span> — to confirm you are who you say you are</li>
                  </ul>
                  <p className="text-sm text-gray-500 mt-2">
                    These images are uploaded securely through Cloudinary, a trusted cloud media service. We do not store them on our own servers.
                  </p>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">GPS Location</h3>
                  <p className="text-gray-400">
                    During registration, we ask for your device&apos;s GPS location. This is a <span className="text-primary font-medium">mandatory step</span>. We use it to verify that our members are real people at real addresses. Your coordinates and approximate address are stored with your account. We will never track your movement or location after registration.
                  </p>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">Reviews and Testimonials</h3>
                  <p className="text-gray-400">
                    If you choose to leave a review, your name, profile photo, plan name, rating, and written review may be displayed publicly on our website after an admin approves it. You are never required to leave a review.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">How We Use Your Information</h2>
              <p>We are straightforward about this. We use your information to:</p>
              <ul className="list-disc list-inside space-y-2 mt-3 text-gray-400">
                <li>Verify your identity before approving your savings account</li>
                <li>Assign you to the correct savings plan and WhatsApp group</li>
                <li>Contact you about your contributions, payouts, and account status</li>
                <li>Display approved testimonials to build trust with new members</li>
                <li>Improve our platform and understand our community better</li>
              </ul>
              <p className="mt-3 font-medium text-white">
                We do not sell, rent, or trade your personal information to anyone. Period.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Where Your Data Lives</h2>
              <p>
                Your account information (name, email, phone, plan, status, GPS) is stored securely in Google Firebase, which is a cloud platform run by Google. Firebase uses industry-standard encryption and security practices to protect your data.
              </p>
              <p className="mt-3">
                Your uploaded photos (Ghana Card, passport photo) are stored through Cloudinary, a secure cloud-based media management service. Both Firebase and Cloudinary have data centres outside Ghana, which means your data may be processed internationally. By using our platform, you agree to this.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Who Can See Your Information</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><span className="text-gray-300">You</span> can see your own profile, documents, and status on your dashboard</li>
                <li><span className="text-gray-300">Our admin team</span> can see all member data to manage approvals, plans, and WhatsApp group assignments</li>
                <li><span className="text-gray-300">Other members</span> can only see your approved testimonials (name, photo, plan, and review text)</li>
                <li><span className="text-gray-300">Nobody else</span> gets access to your data unless we are required by Ghanaian law to share it</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc list-inside space-y-2 mt-3 text-gray-400">
                <li>Ask us what personal data we have about you</li>
                <li>Request corrections to your information</li>
                <li>Ask us to delete your account and associated data</li>
                <li>Withdraw your consent for us to use your GPS location (though this may affect your account status)</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, simply message us on WhatsApp or call us. We are real people, and we will handle your request personally.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Cookies and Tracking</h2>
              <p>
                We keep things simple. Our website uses basic browser storage to keep you logged in. We do not use advertising cookies, tracking pixels, or any third-party analytics tools that follow you around the internet. When you close your browser, that is it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Children</h2>
              <p>
                Our platform is designed for adults who are 18 years or older. We do not knowingly collect information from anyone under 18. If we discover that a minor has registered, we will remove their data immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Changes to This Policy</h2>
              <p>
                If we change how we handle your data, we will update this page and change the date at the top. For significant changes, we will let you know through our WhatsApp groups. We encourage you to check back occasionally.
              </p>
            </section>

            <section className="border-t border-white/10 pt-6">
              <h2 className="text-xl font-bold text-white mb-3">Contact Us</h2>
              <p>
                If something does not feel right, or you just want to ask a question about your data, reach out:
              </p>
              <ul className="list-none space-y-1 mt-3 text-gray-400">
                <li>📱 WhatsApp: <a href="https://wa.me/233504701032" className="text-primary hover:underline">+233 504 701 032</a></li>
                <li>📞 Phone: <a href="tel:+233244990995" className="text-primary hover:underline">+233 244 990 995</a></li>
              </ul>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
