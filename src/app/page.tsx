import Navigation from "@/components/layout/navigation";
import HeroSection from "@/components/home/hero";
import RabiSection from "@/components/home/rabi";
import PlansSection from "@/components/home/plans";
import CalculatorSection from "@/components/home/calculator";
import TrustSection from "@/components/home/trust";
import TestimonialsSection from "@/components/home/testimonials";
import FaqSection from "@/components/home/faq";
import ContactSection from "@/components/home/contact-section";
import CTABanner from "@/components/home/cta-banner";
import Footer from "@/components/layout/footer";

export default function Home() {
  return (
    <>
      <Navigation />
      <main className="flex min-h-screen flex-col w-full">
        <HeroSection />
        {/*
          "Who is Rabi" comes directly after the hero, before the plan grid.
          The plan grid answers "what does it cost"; this answers "who am I
          paying", and it is the question that decides whether a stranger joins
          at all. It also replaces the spot where three invented statistics used
          to sit, so the first two screens now contain no unverifiable claim.
        */}
        <RabiSection />
        <PlansSection />
        <CalculatorSection />
        <TrustSection />
        <TestimonialsSection />
        <FaqSection />
        <ContactSection />
        <CTABanner />
      </main>
      <Footer />
    </>
  );
}