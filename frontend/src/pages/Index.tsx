import { useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Shield, Users, Zap, Timer, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const dimensions = [
  { id: "D1", name: "Strategy", desc: "AI vision, executive mandate, multi-year investment roadmap", icon: "🎯" },
  { id: "D2", name: "Process", desc: "AI embedded in core workflows, human-AI teaming", icon: "⚙️" },
  { id: "D3", name: "Talent & Skills", desc: "Workforce AI fluency, ML engineering depth", icon: "🧠" },
  { id: "D4", name: "Platform & Technology", desc: "Enterprise LLM platform, MLOps, cloud maturity", icon: "☁️" },
  { id: "D5", name: "Organisation", desc: "AI CoE maturity, cross-functional squad model", icon: "🏢" },
  { id: "D6", name: "Data", desc: "Data platform maturity, quality framework, ML-readiness", icon: "📊" },
  { id: "D7", name: "Performance & Value", desc: "AI ROI framework, KPI dashboard, value attribution", icon: "📈" },
  { id: "D8", name: "Governance", desc: "AI ethics policy, model registry, regulatory compliance", icon: "🛡️" },
  { id: "D9", name: "Risk Management", desc: "Model risk framework, incident response playbook", icon: "⚠️" },
];

const stages = [
  { level: "01", name: "AI Aware", range: "1.0–2.0", tag: "Pilots without programme", color: "text-muted-foreground" },
  { level: "02", name: "AI Embedded", range: "2.0–3.0", tag: "Strategy exists, delivery doesn't", color: "text-muted-foreground" },
  { level: "03", name: "AI Scaled", range: "3.0–4.0", tag: "Production at pace", color: "text-primary" },
  { level: "04", name: "AI Native", range: "4.0–4.5", tag: "Agentic at core", color: "text-primary" },
  { level: "05", name: "AI Realized", range: "4.5–5.0", tag: "AI product studio", color: "text-primary" },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-mesh-gradient relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="orb orb-gold w-[500px] h-[500px] top-[-10%] left-[-5%]" />
      <div className="orb orb-blue w-[400px] h-[400px] top-[20%] right-[-8%]" />
      <div className="orb orb-purple w-[350px] h-[350px] bottom-[10%] left-[30%]" />
      <div className="bg-grid-pattern absolute inset-0 opacity-30 pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-border/50 backdrop-blur-md px-6 py-2.5 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-sm font-extrabold text-primary-foreground tracking-tight">EY</span>
          </div>
          <span className="text-sm font-semibold text-foreground tracking-wide uppercase">GCC AI Realized Index</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="hover:bg-white/5">Sign in</Button>
          <Button variant="ey" size="sm" onClick={() => navigate("/signup")} className="shimmer">Get Started</Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 py-16 max-w-4xl mx-auto text-center">
        <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="inline-flex items-center gap-3 rounded-2xl border-2 border-primary/30 bg-primary/10 backdrop-blur-md px-7 py-3.5 mb-6 shadow-xl shadow-primary/10">
            <Timer className="h-5 w-5 text-primary shrink-0" />
            <span className="text-lg sm:text-xl font-extrabold text-primary">Complete in under 10 minutes</span>
          </div>
        </div>
        <h1 className="text-5xl sm:text-7xl font-extrabold text-foreground leading-[1.08] mb-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          Benchmark your GCC's
          <span className="text-ey-gradient text-glow block mt-2">AI maturity</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed animate-fade-in" style={{ animationDelay: '0.35s' }}>
          A 9-dimension diagnostic that scores your GCC against the GARIX maturity framework and benchmarks you against India's leading GCCs.
        </p>
        <div className="flex justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.45s' }}>
          <Button variant="ey" size="lg" onClick={() => navigate("/signup")} className="pulse-ring shimmer group">
            Start Assessment
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate("/login")} className="border-border/50 backdrop-blur-sm hover:bg-white/5 group">
            Sign in
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-10 sm:gap-16 mt-14 animate-fade-in" style={{ animationDelay: '0.55s' }}>
          {[
            { icon: BarChart3, value: "9", label: "Dimensions scored" },
            { icon: Shield, value: "5", label: "Maturity stages" },
            { icon: Users, value: "7", label: "Stakeholder profiles" },
          ].map((stat) => (
            <div key={stat.label} className="text-center group cursor-default">
              <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="text-3xl font-extrabold text-primary text-glow">{stat.value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 9 Dimensions Grid */}
      <section className="relative z-10 px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-4">
            <div className="h-px w-8 bg-primary/40" />
            Framework
            <div className="h-px w-8 bg-primary/40" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-3">The 9 GARIX Dimensions</h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Each dimension is scored on a 1–5 scale. The composite GARIX score is the weighted average across all 9 dimensions.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {dimensions.map((d) => (
            <div key={d.id} className="garix-card p-6 group cursor-default">
              <div className="flex items-start gap-3">
                <div className="text-xl mt-0.5 shrink-0">{d.icon}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">{d.id}</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{d.name}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{d.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Maturity Stages */}
      <section className="relative z-10 px-6 py-20 max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-4">
            <div className="h-px w-8 bg-primary/40" />
            Progression
            <div className="h-px w-8 bg-primary/40" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-3">Maturity Stages</h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            From scattered AI pilots to a fully AI-native operating model.
          </p>
        </div>
        <div className="space-y-3 stagger-children">
          {stages.map((s, i) => (
            <div key={s.level} className="garix-card p-5 flex items-center gap-5 group">
              <div className="relative">
                <span className="text-2xl font-extrabold text-primary/20 w-10 group-hover:text-primary/50 transition-colors">{s.level}</span>
                {/* Progress bar indicator */}
                <div className="absolute -left-2 top-0 bottom-0 w-0.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary/40 rounded-full transition-all duration-500 group-hover:bg-primary"
                    style={{ height: `${(i + 1) * 20}%` }}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{s.name}</div>
                <div className="text-xs text-muted-foreground">GARIX {s.range}</div>
              </div>
              <span className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-white/[0.02] text-muted-foreground group-hover:border-primary/30 group-hover:text-foreground transition-all whitespace-nowrap">
                {s.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-24 max-w-3xl mx-auto text-center">
        <div className="glass-card gradient-border p-12 animate-glow-pulse relative overflow-hidden">
          {/* Decorative inner glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="relative z-10">
            <Sparkles className="h-8 w-8 text-primary mx-auto mb-4 opacity-60" />
            <h2 className="text-3xl font-bold text-foreground mb-3">Ready to benchmark your GCC?</h2>
            <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
              Complete the lite assessment in under 10 minutes and get your indicative AI readiness score with peer benchmarks.
            </p>
            <Button variant="ey" size="lg" onClick={() => navigate("/signup")} className="shimmer group">
              Start the Assessment
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 backdrop-blur-sm px-6 py-8 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-2">
          <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-[8px] font-extrabold text-primary">EY</span>
          </div>
          <span>© 2026 EY. All rights reserved. | GCC AI Realized Index (GARIX)</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
