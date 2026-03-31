import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen bg-mesh-gradient flex relative overflow-hidden">
      {/* Global background orbs */}
      <div className="orb orb-gold w-[400px] h-[400px] top-[-5%] right-[20%]" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[10%] left-[40%]" />

      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 border-r border-border/50 relative overflow-hidden">
        {/* Background pattern */}
        <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />
        {/* Decorative gradient */}
        <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] bg-primary/8 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-8 w-8 rounded bg-primary flex items-center justify-center shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
              <span className="text-sm font-extrabold text-primary-foreground tracking-tight">EY</span>
            </div>
            <span className="text-sm font-semibold text-foreground tracking-wide uppercase">GCC AI Realized Index</span>
          </Link>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-extrabold text-foreground leading-tight animate-fade-in">
            Benchmark your GCC's
            <span className="text-ey-gradient text-glow block">AI maturity.</span>
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed max-w-sm animate-fade-in" style={{ animationDelay: '0.15s' }}>
            9 dimensions. 5 maturity stages. One diagnostic that shows exactly where you stand — and what to do next.
          </p>

          {/* Stats row */}
          <div className="flex gap-8 pt-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            {[
              { value: "9", label: "Dimensions" },
              { value: "5", label: "Stages" },
              { value: "<10", label: "Minutes" },
            ].map((stat) => (
              <div key={stat.label} className="text-center group cursor-default">
                <div className="text-2xl font-extrabold text-primary text-glow transition-transform group-hover:scale-110">{stat.value}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Decorative feature pills */}
          <div className="flex flex-wrap gap-2 pt-4 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            {["AI Strategy", "MLOps", "Governance", "Talent"].map((tag) => (
              <span key={tag} className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 border border-border/50 rounded-full px-3 py-1 bg-white/[0.02]">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-primary/40" />
          © 2026 EY. All rights reserved.
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile header */}
          <Link to="/" className="flex lg:hidden items-center gap-3 mb-10">
            <div className="h-8 w-8 rounded bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-sm font-extrabold text-primary-foreground tracking-tight">EY</span>
            </div>
            <span className="text-sm font-semibold text-foreground tracking-wide uppercase">GARIX</span>
          </Link>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">{title}</h2>
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
