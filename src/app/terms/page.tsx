"use client";

import Navigation from "@/components/layout/navigation";
import Footer from "@/components/layout/footer";

export default function TermsOfServicePage() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen pt-28 pb-20 px-4">
        <article className="max-w-3xl mx-auto prose-container">
          <h1 className="font-display text-3xl md:text-4xl text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: 28 March 2026</p>

          <div className="space-y-8 text-gray-300 text-[15px] leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-white mb-3">The Short Version</h2>
              <p>
                Rabi&apos;s Saving Hub is a community savings platform — what many Ghanaians know as &ldquo;Susu.&rdquo; You contribute a set amount on a regular schedule (daily, weekly, or monthly), and at the end of your cycle, you receive your accumulated savings plus any returns according to your chosen plan. These terms explain how the relationship between you and us works. Please read them carefully before creating an account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">1. Accepting These Terms</h2>
              <p>
                By creating an account on Rabi&apos;s Saving Hub, you are telling us that you have read and understood these terms, and you agree to follow them. If you do not agree, please do not sign up. It is that simple.
              </p>
              <p className="mt-3">
                You must be at least 18 years old and legally able to enter agreements under Ghanaian law to use this platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">2. How It Works</h2>

              <div className="space-y-4 mt-4">
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">Registration</h3>
                  <p className="text-gray-400">
                    You choose a savings plan, provide your personal details, upload your Ghana Card (front and back) and a passport-style photo, and allow GPS location access for identity verification. Your application goes to our admin team for review. Until your account is approved, you cannot participate in any savings groups.
                  </p>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">Approval</h3>
                  <p className="text-gray-400">
                    We manually review every application. We check your documents, confirm your identity, and verify your location. We reserve the right to reject any application without giving a specific reason. If approved, you will receive a WhatsApp group invitation link matching your chosen plan.
                  </p>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">Contributions</h3>
                  <p className="text-gray-400">
                    Your Susu contributions are managed through WhatsApp. You are responsible for making your payments on time according to the schedule of your selected plan. The contribution amounts, frequencies, and expected returns are clearly displayed when you choose your plan:
                  </p>
                  <ul className="list-disc list-inside mt-2 text-gray-500 text-sm space-y-1">
                    <li><span className="text-gray-400">Daily plans</span> — starting from GH₵6 per day</li>
                    <li><span className="text-gray-400">Weekly plans</span> — GH₵150, GH₵200, or GH₵300 per week</li>
                    <li><span className="text-gray-400">Monthly plans</span> — GH₵600, GH₵700, or GH₵1,000 per month</li>
                    <li><span className="text-gray-400">6-month plans</span> — GH₵20 or GH₵35 daily for 6 months</li>
                    <li><span className="text-gray-400">High Achiever plans</span> — incremental GH₵1 contributions over 100, 200, or 300 days</li>
                  </ul>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-2">Returns and Payouts</h3>
                  <p className="text-gray-400">
                    The return amounts listed on each plan are estimates based on the full completion of your savings cycle. You must complete all your scheduled contributions to receive your full return. If you miss contributions or withdraw early, your actual return may be different. We will communicate payout details through your WhatsApp group.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">3. Your Responsibilities</h2>
              <p>When you use our platform, you agree to:</p>
              <ul className="list-disc list-inside space-y-2 mt-3 text-gray-400">
                <li>Provide truthful, accurate information during registration</li>
                <li>Upload genuine identification documents — your own Ghana Card and your own photograph</li>
                <li>Keep your login credentials private and not share your account with others</li>
                <li>Make your contributions on time as agreed in your plan</li>
                <li>Behave respectfully in the WhatsApp groups and not engage in spam, harassment, or fraud</li>
                <li>Not use our platform for money laundering, fraud, or any illegal activity</li>
              </ul>
              <p className="mt-3 text-white font-medium">
                If we find that you have provided false documents or are using the platform dishonestly, we will terminate your account and you may lose your contributions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">4. Our Responsibilities</h2>
              <p>We commit to:</p>
              <ul className="list-disc list-inside space-y-2 mt-3 text-gray-400">
                <li>Reviewing your application in a fair and timely manner</li>
                <li>Keeping your personal data secure and private (see our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>)</li>
                <li>Communicating clearly about your plan, contributions, and payouts</li>
                <li>Being reachable and responsive through our WhatsApp and phone channels</li>
                <li>Operating this platform honestly and transparently</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">5. Reviews and Testimonials</h2>
              <p>
                As an approved member, you can submit reviews about your experience. When you submit a review, you give us permission to display your name, profile photo, plan name, and review text publicly on our website. All reviews go through admin approval before being published. We can remove any review at our discretion — for example, if it contains inappropriate language, false claims, or spam.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">6. Account Termination</h2>
              <p>We can suspend or close your account if:</p>
              <ul className="list-disc list-inside space-y-2 mt-3 text-gray-400">
                <li>You violate any of these terms</li>
                <li>You provide false or fraudulent information</li>
                <li>You engage in behaviour that harms other members or the platform</li>
                <li>We are required to do so by law</li>
              </ul>
              <p className="mt-3">
                You can also close your own account at any time by contacting us. If you have ongoing contributions, we will discuss your options for settlement before closing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">7. Important Disclaimers</h2>

              <div className="bg-amber-900/10 border border-amber-500/20 rounded-xl p-4 mt-3">
                <p className="text-gray-400">
                  <span className="text-amber-400 font-semibold">Please understand:</span> Rabi&apos;s Saving Hub is a community savings platform, not a licensed bank or financial institution. Your contributions are not insured by any government deposit scheme. While we work hard to honour every plan, savings always involve some level of risk. The returns listed on our plans are targets, not guarantees.
                </p>
              </div>

              <p className="mt-4">
                We provide this platform &ldquo;as is.&rdquo; We do our absolute best to keep things running smoothly, but we cannot promise that the website will be available 100% of the time or completely free of technical issues. We are not responsible for losses caused by internet outages, device problems, or other factors outside our control.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">8. Disputes</h2>
              <p>
                If you have a disagreement with us, we genuinely want to sort it out directly. Please contact us first through WhatsApp or phone call so we can try to resolve things person-to-person. If we cannot reach an agreement, any formal dispute will be governed by the laws of Ghana and handled in the appropriate courts within the Greater Accra Region.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">9. Changes to These Terms</h2>
              <p>
                We may update these terms as our platform grows. When we do, we will change the date at the top of this page and inform our community through WhatsApp. Continuing to use the platform after changes are posted means you accept the updated terms.
              </p>
            </section>

            <section className="border-t border-white/10 pt-6">
              <h2 className="text-xl font-bold text-white mb-3">Questions?</h2>
              <p>
                These terms might feel heavy, but the core of it is simple: be honest, pay on time, and we will take care of the rest. If anything is unclear, just ask. We are always here.
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
