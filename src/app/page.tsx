import Navigation from "@/components/layout/navigation";
import HeroSection from "@/components/home/hero";
import PlansSection from "@/components/home/plans";
import CalculatorSection from "@/components/home/calculator";
import TrustSection from "@/components/home/trust";
import TestimonialsSection from "@/components/home/testimonials";
import ContactSection from "@/components/home/contact-section";
import CTABanner from "@/components/home/cta-banner";
import Footer from "@/components/layout/footer";

export default function Home() {
  return (
    <>
      <Navigation />
      <main className="flex min-h-screen flex-col w-full">
        <HeroSection />
        <PlansSection />
        <CalculatorSection />
        <TrustSection />
        <TestimonialsSection />
        <ContactSection />
        <CTABanner />
      </main>
      <Footer />
    </>
  );
}