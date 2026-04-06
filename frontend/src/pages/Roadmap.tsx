import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Home, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

interface DimensionScore {
  dimension_id: number;
  dimension_name: string;
  score: number;
  weight: number;
  weighted_score: number;
}

interface Scores {
  dimensions: DimensionScore[];
  composite_score: number;
  total_weighted: number;
  total_weight: number;
}

interface ActionItem {
  number: number;
  title: string;
  description: string;
  timeline: string;
}

interface JourneyPhase {
  months: string;
  phase_title: string;
  milestones: string[];
}

interface Roadmap {
  target_score: number;
  target_stage_name: string;
  actions: ActionItem[];
  journey: JourneyPhase[];
  projected_landing: string;
}

function getStageLabel(score: number): string {
  if (score < 2) return "AI Aware";
  if (score < 3) return "AI Embedded";
  if (score < 4) return "AI Scaled";
  if (score < 4.5) return "AI Native";
  return "AI Realized";
}

function getStageNumber(score: number): number {
  if (score < 2) return 1;
  if (score < 3) return 2;
  if (score < 4) return 3;
  if (score < 4.5) return 4;
  return 5;
}

const TIMELINE_COLORS: Record<string, string> = {
  "30-day action": "border-primary text-primary",
  "60-day action": "border-primary text-primary",
  "90-day action": "border-primary text-primary",
};

const RoadmapPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { scores, persona, role, insights, answers } = (location.state || {}) as {
    scores?: Scores;
    persona?: string;
    role?: string;
    insights?: Record<string, string[]>;
    answers?: any[];
  };

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!scores || !persona || !role) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const fetchRoadmap = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/roadmap/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona,
            role,
            composite_score: scores.composite_score,
            dimensions: scores.dimensions,
            uid: auth.currentUser?.uid || undefined,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to generate roadmap");
        const data = await res.json();
        setRoadmap(data.roadmap);
      } catch (err: any) {
        if (err.name === "AbortError") {
          toast.error("Roadmap generation timed out. Please try again.");
        } else {
          toast.error("Failed to generate roadmap. Please try again.");
        }
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    };

    fetchRoadmap();

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [scores, persona, role]);

  const handleRequestDiagnostic = async () => {
    if (!scores || !persona || !role) return;
    setSending(true);
    try {
      const user = auth.currentUser;
      const res = await fetch(`${API_BASE}/api/diagnostic/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: user?.displayName || user?.email?.split("@")[0] || "Unknown",
          user_email: user?.email || "unknown@email.com",
          persona,
          role,
          composite_score: scores.composite_score,
          dimensions: scores.dimensions,
          insights: insights || {},
          roadmap: roadmap || undefined,
          answers: answers || [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to send request");
      }
      toast.success("Diagnostic request sent! Our team will get in touch with you soon.");
    } catch (error: any) {
      toast.error(error.message || "Failed to send diagnostic request");
    } finally {
      setSending(false);
    }
  };

  if (!scores) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center p-6 relative overflow-hidden">
        <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
        <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
        <div className="text-center relative z-10">
          <h2 className="text-xl font-semibold text-foreground mb-2">No results found</h2>
          <p className="text-muted-foreground text-sm mb-6">Please complete the assessment first.</p>
          <Button variant="ey" onClick={() => navigate("/designation")}>
            Start Assessment <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center relative overflow-hidden">
        <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
        <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
        <div className="flex flex-col items-center gap-6 relative z-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground mb-2">
              Building your AI transformation roadmap…
            </p>
            <p className="text-sm text-muted-foreground">
              Generating personalized actions for {role} in {persona}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center p-6 relative overflow-hidden">
        <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
        <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
        <div className="text-center relative z-10">
          <h2 className="text-xl font-semibold text-foreground mb-2">Roadmap generation failed</h2>
          <p className="text-muted-foreground text-sm mb-6">Please go back and try again.</p>
          <Button variant="ey" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  const currentStage = getStageNumber(scores.composite_score);
  const currentStageLabel = getStageLabel(scores.composite_score);
  const targetStageNum = getStageNumber(roadmap.target_score);

  return (
    <div className="min-h-screen bg-mesh-gradient relative overflow-hidden">
      <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
      <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 px-4 sm:px-6 py-8 sm:py-12">

        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground group mb-4"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-1 transition-transform group-hover:-translate-x-1" />
          Back
        </Button>

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-px w-6 bg-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.2em]">
              Your AI Transformation Roadmap
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {persona}'s path to {roadmap.target_stage_name}
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Your current GARIX score is {scores.composite_score.toFixed(1)} (Stage {currentStage}).
            Based on your profile, here are your 3 immediate actions and a 6-month roadmap to
            reach Stage {targetStageNum} — GARIX {roadmap.target_score.toFixed(1)}.
          </p>
        </div>

        {/* ═══ Immediate Actions ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {roadmap.actions.map((action) => (
            <div
              key={action.number}
              className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 flex flex-col"
            >
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Action {String(action.number).padStart(2, "0")}
              </span>
              <h3 className="text-base font-bold text-foreground mb-3">
                {action.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
                {action.description}
              </p>
              <span
                className={`self-start text-[11px] font-bold rounded-md border px-2.5 py-1 ${
                  TIMELINE_COLORS[action.timeline] || "border-primary text-primary"
                }`}
              >
                {action.timeline}
              </span>
            </div>
          ))}
        </div>

        {/* ═══ 6-Month Transformation Journey ═══ */}
        <div className="mb-12">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-8">
            6-Month AI Transformation Journey
          </h2>

          <div className="relative pl-8">
            {/* Vertical timeline line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-primary/40" />

            {roadmap.journey.map((phase, idx) => (
              <div key={idx} className="relative mb-10 last:mb-0">
                {/* Timeline dot */}
                <div className="absolute -left-5 top-0.5 h-3 w-3 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.4)]" />

                {/* Month label */}
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Month {phase.months}
                </span>

                <h3 className="text-sm font-bold text-primary mt-1 mb-3">
                  {phase.phase_title}
                </h3>

                <ul className="space-y-1.5">
                  {phase.milestones.map((m, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary text-xs mt-0.5">→</span>
                      <span className="text-xs text-muted-foreground">{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Projected 6-Month Landing ═══ */}
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 sm:p-8 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center">
            {/* Score display */}
            <div className="text-center sm:text-left">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                Projected 6-Month Landing
              </span>
              <span className="text-5xl sm:text-6xl font-extrabold text-primary block">
                {roadmap.target_score.toFixed(1)}
              </span>
              <span className="text-xs font-medium text-primary/70 mt-1 block">
                Stage {targetStageNum} — {roadmap.target_stage_name}
              </span>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {roadmap.projected_landing.split(roadmap.target_score.toFixed(1)).map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>
                    {part}
                    <span className="font-bold text-primary">
                      GARIX {roadmap.target_score.toFixed(1)}
                    </span>
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          </div>
        </div>

        {/* ═══ CTA ═══ */}
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 mb-8">
          <h3 className="text-base font-bold text-foreground mb-2">
            Want a full GARIX diagnostic?
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
            This indicative score is based on 9 questions. The full EY GARIX diagnostic covers
            63 questions across 7 stakeholder profiles, delivering a scored 9-dimension GARIX
            profile, peer benchmark comparison, and a stage-gated 24-month transformation
            roadmap with investment cases.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="ey"
              size="lg"
              className="shimmer"
              disabled={sending}
              onClick={handleRequestDiagnostic}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending request…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Request full diagnostic
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate("/designation")}
            >
              Retake assessment
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pb-8">
          <Button
            variant="outline"
            size="lg"
            onClick={() => { navigate("/"); window.scrollTo(0, 0); }}
          >
            <Home className="h-4 w-4 mr-1" />
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RoadmapPage;
