import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className = "", hover = false }: CardProps) {
  return (
    <div
      className={`bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-6 ${
        hover ? "hover:border-primary/30 hover:bg-white/[0.06] transition-all duration-300 cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
