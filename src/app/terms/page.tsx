"use client";

import Navigation from "@/components/layout/navigation";
import Footer from "@/components/layout/footer";

export default function TermsOfServicePage() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen pt-28 pb-20 px-4">
        <article className="max-w-3xl mx-auto prose-container">
          <h1 className="font-display text-3xl md:text-4xl text-white mb-2">Platform Rules & Agreements</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: 5 April 2026</p>

          <div className="space-y-8 text-gray-300 text-[15px] leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-white mb-3">Welcome to Rabi&apos;s Saving Hub</h2>
              <p>
                We do things correctly here so everyone can save and grow their money without stress or excuses. This is a serious Susu community. Before you join our platform and start contributing, you must read and agree to every single rule listed below. If these rules do not work for you, we respectfully ask that you do not sign up. 
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3">The Core Rules</h2>
              <div className="space-y-5">
                
                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">1. Start Date</h3>
                  <p className="text-gray-300">Savings officially begin on Monday, 16th March 2026. Do not miss the start date.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">2. Payment Deadlines</h3>
                  <p className="text-gray-300">Your money must be paid daily, or paid in full on CASHOUT days strictly before 4:00 PM. We do not accept late payments interfering with our schedule.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">3. Mobile Money References</h3>
                  <p className="text-gray-300">Your actual registered name must be used as your Momo reference. You can also call us directly to confirm your payments if you want to be extra sure we received it. No anonymous transfers.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">4. Non Refundable</h3>
                  <p className="text-gray-300">Money sent to the Susu account is absolutely not refundable under any circumstances. Commit to your plan.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">5. Late Penalties</h3>
                  <p className="text-gray-300">Any delay in payments will automatically trigger a penalty fee of GH₵10. We respect time here.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">6. No Excuses</h3>
                  <p className="text-gray-300">We do not entertain stories like &quot;pay for me I will give it to you tomorrow.&quot; You are responsible for your own contributions.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">7. Identification Requirement</h3>
                  <p className="text-gray-300">You absolutely cannot participate in this savings community without a valid Ghana card. Period.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">8. Cashout Protocol</h3>
                  <p className="text-gray-300">Everyone is obligated to fill out our mandatory Google form before receiving their CASHOUT amount. If you do not fill the form, no money will be sent to you.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">9. Mandatory Completion</h3>
                  <p className="text-gray-300">You cannot stop your contributions midway. You are locked in until every single member has been paid.</p>
                </div>

                <div className="bg-[#051A10] border border-[#065F46] rounded-xl p-5">
                  <h3 className="text-primary font-bold mb-1">10. Zero Tolerance for Theft</h3>
                  <p className="text-gray-300">Anyone who tries to stop contributing after taking their own cashout money will be considered a thief. You will be arrested or sued without hesitation.</p>
                </div>

              </div>
            </section>

            <section className="bg-primary/5 border border-primary/20 rounded-xl p-6 mt-8">
              <h2 className="text-xl font-bold text-white mb-3">Final Note</h2>
              <p>
                We put these strict rules in place because trust and discipline are the foundation of any successful Susu. We handle your money safely, and we expect you to handle your payments seriously. If anything is unclear, feel free to call our main line.
              </p>
              <ul className="list-none space-y-2 mt-4 text-gray-300 font-medium">
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
