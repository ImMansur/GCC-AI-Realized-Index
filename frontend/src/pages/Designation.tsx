import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Building2, Settings, Database, Bot, Users, BarChart3, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

const PERSONAS = [
  {
    id: "gcc-leadership",
    title: "GCC Leadership",
    icon: Building2,
    roles: ["GCC Head", "Managing Director (MD)", "Chief Operating Officer (COO)", "Strategy Officer"],
  },
  {
    id: "tech-leadership",
    title: "Technology Leadership",
    icon: Settings,
    roles: ["CTO/VP Engineering", "Head of IT"],
  },
  {
    id: "data-leadership",
    title: "Data Leadership",
    icon: Database,
    roles: ["Head of Data", "Chief Data Officer", "Analytics Lead"],
  },
  {
    id: "ai-ml-practitioners",
    title: "AI / ML Practitioners",
    icon: Bot,
    roles: ["Data Scientists", "ML Engineers", "AI CoE"],
  },
  {
    id: "hr-talent-leadership",
    title: "HR & Talent Leadership",
    icon: Users,
    roles: ["CHRO / VP HR", "Head of L&D", "Talent Acquisition"],
  },
  {
    id: "function-business-leaders",
    title: "Function / Business Leaders",
    icon: BarChart3,
    roles: ["Head of Finance Ops", "Head of Risk", "Operations Lead"],
  },
  {
    id: "risk-legal-compliance",
    title: "Risk, Legal & Compliance",
    icon: Scale,
    roles: ["General Counsel", "Head of Risk", "Compliance Officer"],
  },
];

const Designation = () => {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const navigate = useNavigate();

  const activePersona = PERSONAS.find((p) => p.id === selectedPersona);

  const handleContinue = () => {
    if (selectedPersona && selectedRole && activePersona) {
      navigate(`/survey?persona=${encodeURIComponent(activePersona.title)}&role=${encodeURIComponent(selectedRole)}`);
    }
  };

  const handleBack = () => {
    setSelectedRole(null);
    setSelectedPersona(null);
  };

  return (
    <div className="min-h-screen bg-mesh-gradient flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background orbs */}
      <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
      <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />

      <div className="w-full max-w-3xl relative z-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px w-6 bg-primary" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {activePersona ? "Step 2 — Select Role" : "Step 1 — Select Persona"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {activePersona
              ? `Choose your role in ${activePersona.title}`
              : "What best describes your persona?"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activePersona
              ? "Pick the role that most closely matches your position"
              : "This helps us tailor your GARIX assessment experience"}
          </p>
        </div>

        {/* Persona Grid (Step 1) */}
        {!activePersona && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
            {PERSONAS.map((persona) => {
              const Icon = persona.icon;
              const isSelected = selectedPersona === persona.id;
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => {
                    setSelectedPersona(persona.id);
                    setSelectedRole(null);
                  }}
                  className={`group relative flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all duration-300 backdrop-blur-sm ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-[0_0_24px_-5px_hsl(var(--primary)/0.35)] scale-[1.02]"
                      : "border-border/50 bg-card/40 hover:border-primary/40 hover:bg-card/60 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-black/20"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-300 ${
                      isSelected
                        ? "bg-primary/20 text-primary scale-110 shadow-lg shadow-primary/20"
                        : "bg-muted/50 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-semibold transition-colors ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {persona.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {persona.roles.join(", ")}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)] animate-scale-in" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Role List (Step 2) */}
        {activePersona && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-children">
            {activePersona.roles.map((role) => {
              const isSelected = selectedRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  className={`group relative flex items-center gap-4 rounded-xl border p-5 text-left transition-all duration-300 backdrop-blur-sm ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-[0_0_24px_-5px_hsl(var(--primary)/0.35)] scale-[1.02]"
                      : "border-border/50 bg-card/40 hover:border-primary/40 hover:bg-card/60 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-black/20"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-300 ${
                      isSelected
                        ? "bg-primary/20 text-primary scale-110 shadow-lg shadow-primary/20"
                        : "bg-muted/50 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
                    }`}
                  >
                    <activePersona.icon className="h-5 w-5" />
                  </div>
                  <h3 className={`text-sm font-semibold transition-colors ${isSelected ? "text-primary" : "text-foreground"}`}>
                    {role}
                  </h3>
                  {isSelected && (
                    <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)] animate-scale-in" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="mt-8 flex justify-between animate-fade-in" style={{ animationDelay: '0.5s' }}>
          {activePersona ? (
            <Button
              variant="outline"
              size="lg"
              onClick={handleBack}
              className="group"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back
            </Button>
          ) : (
            <div />
          )}
          <Button
            variant="ey"
            size="lg"
            onClick={handleContinue}
            disabled={!selectedPersona || !selectedRole}
            className="min-w-[200px] shimmer group"
          >
            Continue
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Designation;
