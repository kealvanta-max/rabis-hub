import Link from "next/link";
import Image from "next/image";
import { Facebook, Instagram } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-navy-dark border-t border-white/5 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4 group">
              <Image 
                src="/brand_logo.png" 
                alt="Rabi's Saving Hub Logo" 
                width={160}
                height={40}
                className="h-10 w-auto object-contain drop-shadow-md group-hover:scale-105 transition-transform"
              />
              <span className="font-display text-xl gold-text-gradient font-bold tracking-tight">Rabi&apos;s Saving Hub</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mb-6">
              Ghana&apos;s trusted Susu savings platform. Save smart, grow together with a community that cares.
            </p>
            {/* Social Media Links */}
            <div className="flex items-center gap-4">
              <a href="https://www.tiktok.com/@rabissavinghub" target="_blank" rel="noopener noreferrer" aria-label="Follow us on TikTok" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-primary/20 hover:border-primary/30 transition-all group">
                <TikTokIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </a>
              <a href="https://www.instagram.com/rabisavinghub" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-primary/20 hover:border-primary/30 transition-all group">
                <Instagram className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </a>
              <a href="https://www.facebook.com/profile.php?id=61576456847439" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Facebook" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-primary/20 hover:border-primary/30 transition-all group">
                <Facebook className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Quick Links</h4>
            <ul className="space-y-2.5">
              <FooterLink href="/#plans">Our Plans</FooterLink>
              <FooterLink href="/#calculator">Calculator</FooterLink>
              <FooterLink href="/#testimonials">Testimonials</FooterLink>
              <FooterLink href="/#contact">Contact Us</FooterLink>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Account</h4>
            <ul className="space-y-2.5">
              <FooterLink href="/auth?mode=signup">Create Account</FooterLink>
              <FooterLink href="/auth?mode=signin">Sign In</FooterLink>
              <FooterLink href="/dashboard">Dashboard</FooterLink>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Contact</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="tel:+233244990995" className="text-sm text-gray-500 hover:text-primary transition-colors">
                  +233 244 990 995
                </a>
              </li>
              <li>
                <a href="mailto:rabisavinghub@gmail.com" className="text-sm text-gray-500 hover:text-primary transition-colors">
                  rabisavinghub@gmail.com
                </a>
              </li>
              <li className="text-sm text-gray-500">Accra, Ghana</li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Rabi&apos;s Saving Hub. All rights reserved.
          </p>
          <div className="flex gap-4 items-center">
            <Link href="/privacy" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Privacy Policy</Link>
            <div className="w-1 h-1 rounded-full bg-gray-800" />
            <Link href="/terms" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-gray-500 hover:text-primary transition-colors">
        {children}
      </Link>
    </li>
  );
}

// Custom TikTok icon since Lucide doesn't have it natively
function TikTokIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}
