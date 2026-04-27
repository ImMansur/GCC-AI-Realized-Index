import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Home, Loader2, Send, Settings2, Clock, Target, Info } from "lucide-react";
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

interface DimensionTarget {
  dimension_name: string;
  current_score: number;
  target_score: number;
}

interface Roadmap {
  target_score: number;
  target_stage_name: string;
  roadmap_duration: string;
  target_score_range?: string;
  target_state?: string;
  dimension_targets?: DimensionTarget[];
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

// ---- HEADROOM-BASED FORMULA ----
function computeTargetRange(cs: number, durationMonths: number): { min: number; max: number } {
  const headroom = 5.0 - cs;
  const timeFactor = durationMonths / 12;
  const captureConservative = 0.45 * Math.pow(timeFactor, 0.65);
  const captureOptimistic = 0.65 * Math.pow(timeFactor, 0.55);

  let targetMin = Math.round(Math.min(5.0, cs + headroom * captureConservative) * 10) / 10;
  let targetMax = Math.round(Math.min(5.0, cs + headroom * captureOptimistic) * 10) / 10;

  const roundedScore = Math.round(cs * 10) / 10;
  if (targetMin <= roundedScore) {
    targetMin = Math.min(5.0, roundedScore + 0.1);
  }
  if (targetMax < targetMin) {
    targetMax = targetMin;
  }

  return { min: targetMin, max: targetMax };
}

const TIMELINE_COLORS: Record<string, string> = {
  "30-day action": "border-primary text-primary",
  "60-day action": "border-primary text-primary",
  "90-day action": "border-primary text-primary",
};

function maxMonthLabel(duration: string): string {
  const nums = duration.match(/\d+/g);
  if (!nums) return duration;
  const max = Math.max(...nums.map(Number));
  return `${max}-Month`;
}

const RoadmapPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { scores, persona, role, insights, answers, roadmap: preGeneratedRoadmap } = (location.state || {}) as {
    scores?: Scores;
    persona?: string;
    role?: string;
    insights?: Record<string, string[]>;
    answers?: any[];
    roadmap?: Roadmap;
  };

  const [isConfiguring, setIsConfiguring] = useState(!preGeneratedRoadmap);
  const[selectedTargetIdx, setSelectedTargetIdx] = useState<number>(0);
  const[roadmap, setRoadmap] = useState<Roadmap | null>(preGeneratedRoadmap || null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Determine available durations and unique achievable STAGES
  const targetOptions = scores
    ? (() => {
        const options: Array<{ months: number; range: { min: number; max: number }; stage: string; label: string }> = [];
        const seenStages = new Set<string>();

        const availableMonths =[3, 6, 9, 12].filter((d) => {
          const headroom = 5.0 - scores.composite_score;
          if (headroom <= 0.5 && d === 3) return false;
          return true;
        });

        availableMonths.forEach((m) => {
          const range = computeTargetRange(scores.composite_score, m);
          const stage = getStageLabel(range.max);
          const label = range.min === range.max
            ? `${range.min.toFixed(1)}`
            : `${range.min.toFixed(1)} – ${range.max.toFixed(1)}`;

          // Only keep the shortest duration that hits a new unique stage
          if (!seenStages.has(stage)) {
            seenStages.add(stage);
            options.push({ months: m, range, stage, label });
          }
        });

        return options;
      })()
    :[];

  useEffect(() => {
    if (scores && isConfiguring && targetOptions.length > 0) {
      setSelectedTargetIdx(0); // Default to the quickest achievable target
    }
  },[scores, isConfiguring]);

  const activeOption = targetOptions[selectedTargetIdx] || targetOptions[0];
  const activeDurationMonths = activeOption?.months || 6;
  const targetRangeStr = activeOption?.label || "—";

  const handleGenerateRoadmap = async () => {
    if (!scores || !persona || !role) return;
    
    setLoading(true);
    setIsConfiguring(false);

    try {
      const res = await fetch(`${API_BASE}/api/roadmap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          role,
          composite_score: scores.composite_score,
          duration_months: activeDurationMonths, // Auto-calculated timeframe
          dimensions: scores.dimensions,
          uid: auth.currentUser?.uid || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate roadmap");
      const data = await res.json();
      setRoadmap(data.roadmap);

      const uid = auth.currentUser?.uid;
      if (uid) {
        try {
          await fetch(`${API_BASE}/api/users/${uid}/surveys/latest/roadmap`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roadmap: data.roadmap }),
          });
        } catch { }
      }

      try {
        await fetch(`${API_BASE}/api/survey/send-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: auth.currentUser?.uid || "",
            persona, role, scores, insights: insights || {},
            roadmap: data.roadmap, answers: answers ||[],
          }),
        });
      } catch { }
    } catch (err: any) {
      toast.error("Failed to generate roadmap. Please try again.");
      setIsConfiguring(true); 
    } finally {
      setLoading(false);
    }
  };

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
          persona, role, composite_score: scores.composite_score,
          dimensions: scores.dimensions, insights: insights || {},
          roadmap: roadmap || undefined, answers: answers ||[],
        }),
      });
      if (!res.ok) throw new Error("Failed to send request");
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
        <div className="text-center relative z-10">
          <h2 className="text-xl font-semibold text-foreground mb-2">No results found</h2>
          <p className="text-muted-foreground text-sm mb-6">Please complete the assessment first.</p>
          <Button variant="ey" onClick={() => navigate("/designation")}>Start Assessment <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
    );
  }

  // ─── STAGE 1: CONFIGURATION SANDBOX ───
  if (isConfiguring) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center p-6 relative overflow-hidden">
        <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
        <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
        
        <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 sm:p-8 max-w-lg w-full relative z-10 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Configure Roadmap</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Your baseline score is <span className="font-bold text-foreground">{scores.composite_score.toFixed(1)}</span>. 
            Select your <span className="font-bold">Target Ambition</span> and timeframe to generate your personalized plan.
          </p>

          <div className="space-y-6">
            {/* Target STATE Dropdown - "State: " removed from option label */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Target Stage & Timeline
              </label>
              <select 
                value={selectedTargetIdx}
                onChange={(e) => setSelectedTargetIdx(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground font-semibold focus:ring-1 focus:ring-primary outline-none"
              >
                {targetOptions.map((opt, idx) => (
                  <option key={idx} value={idx}>
                    {opt.stage} — {opt.months} Months
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Indicators for Timeline and Score */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Timeline Needed
                </label>
                <div className="flex flex-col justify-center bg-primary/10 border border-primary/20 rounded-lg p-3 h-20">
                  <div className="flex items-center gap-1.5 text-primary/80 mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Estimated</span>
                  </div>
                  <span className="text-xl font-extrabold text-primary leading-none">
                    {activeDurationMonths} Months
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Score Target
                </label>
                <div className="flex flex-col justify-center bg-primary/10 border border-primary/20 rounded-lg p-3 h-20">
                  <div className="flex items-center gap-1.5 text-primary/80 mb-1">
                    <Target className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Projected</span>
                  </div>
                  <span className="text-xl font-extrabold text-primary leading-none">
                    {targetRangeStr}
                  </span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Button 
                variant="ey" 
                className="w-full h-11 text-base font-semibold" 
                onClick={handleGenerateRoadmap}
              >
                Build AI Roadmap <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── STAGE 2: LOADING SCREEN ───
  if (loading) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center relative overflow-hidden">
        <div className="flex flex-col items-center gap-6 relative z-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground mb-2">Building your AI transformation roadmap…</p>
            <p className="text-sm text-muted-foreground">Targeting '{activeOption?.stage}' for {role} in {persona}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!roadmap) return null;

  // ─── STAGE 3: ROADMAP VIEW ───
  const currentStage = getStageNumber(scores.composite_score);
  const currentStageLabel = getStageLabel(scores.composite_score);
  const targetStageNum = getStageNumber(roadmap.target_score);

  return (
    <div className="min-h-screen bg-mesh-gradient relative overflow-hidden">
      <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
      <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground group shrink-0" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1 transition-transform group-hover:-translate-x-1" /> Back
            </Button>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Sleek Stage Reference Hover Menu */}
              <div className="relative group cursor-help">
                <div className="flex items-center gap-1.5 bg-card border border-border rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                  <Info className="h-3.5 w-3.5" />
                  <span>Stage Reference</span>
                </div>
                
                {/* Hover Dropdown Panel */}
                <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-card border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                   <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b border-border/50">
                     GARIX Maturity Stages
                   </h4>
                   <ul className="text-xs space-y-2 text-foreground font-medium">
                     <li className="flex justify-between"><span>Stage 1: AI Aware</span> <span className="font-mono text-muted-foreground">&lt; 2.0</span></li>
                     <li className="flex justify-between"><span>Stage 2: AI Embedded</span> <span className="font-mono text-muted-foreground">2.0 - 2.9</span></li>
                     <li className="flex justify-between"><span>Stage 3: AI Scaled</span> <span className="font-mono text-muted-foreground">3.0 - 3.9</span></li>
                     <li className="flex justify-between"><span>Stage 4: AI Native</span> <span className="font-mono text-muted-foreground">4.0 - 4.4</span></li>
                     <li className="flex justify-between"><span>Stage 5: AI Realized</span> <span className="font-mono text-muted-foreground">4.5+</span></li>
                   </ul>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={() => { setRoadmap(null); setIsConfiguring(true); }}>
                <Settings2 className="h-4 w-4 mr-1" /> Re-Configure Target
              </Button>
            </div>
        </div>

        {/* ═══ Header ═══ */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-px w-6 bg-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.2em]">Your AI Transformation Roadmap</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {persona}'s path to {roadmap.target_state || roadmap.target_stage_name}
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Your current GARIX score is {scores.composite_score.toFixed(1)} (Stage {currentStage}).
            Here is your personalized {roadmap.roadmap_duration} roadmap to reach a projected score of{" "}
            <span className="font-semibold text-primary">{roadmap.target_score_range || roadmap.target_score.toFixed(1)}</span>{" "}
            (Stage {targetStageNum}).
          </p>
        </div>

        {/* ═══ Score Overview Banner ═══ */}
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-5 sm:p-6 mb-8">
          <div className="grid grid-cols-3 divide-x divide-border/30">
            <div className="text-center px-2 sm:px-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Current Score</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-foreground">{scores.composite_score.toFixed(1)}</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">Stage {currentStage} — {currentStageLabel}</span>
            </div>
            <div className="text-center px-2 sm:px-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Target State</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-primary">{roadmap.target_state || roadmap.target_stage_name}</span>
              <span className="text-[11px] text-primary/70 block mt-0.5">Score Range: {roadmap.target_score_range || roadmap.target_score.toFixed(1)}</span>
            </div>
            <div className="text-center px-2 sm:px-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Duration</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-foreground">{maxMonthLabel(roadmap.roadmap_duration).replace('-', ' ')}</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">Estimated timeline</span>
            </div>
          </div>
        </div>
        
        {/* Dimension Level Goals */}
        {roadmap.dimension_targets && roadmap.dimension_targets.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Dimension-Level Goals</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {roadmap.dimension_targets.map((dt, idx) => {
                const delta = dt.target_score - dt.current_score;
                return (
                  <div key={idx} className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground font-medium truncate">{dt.dimension_name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm text-muted-foreground">{dt.current_score.toFixed(1)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                      <span className="text-sm font-bold text-primary">{dt.target_score.toFixed(1)}</span>
                      <span className={`text-[10px] font-bold ml-1 ${delta > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strategic Actions */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Strategic Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roadmap.actions.map((action) => (
              <div key={action.number} className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Action {String(action.number).padStart(2, "0")}
                </span>
                <h3 className="text-base font-bold text-foreground mb-3">{action.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">{action.description}</p>
                <span className={`self-start text-[11px] font-bold rounded-md border px-2.5 py-1 ${TIMELINE_COLORS[action.timeline] || "border-primary text-primary"}`}>
                  {action.timeline}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Transformation Journey */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6">
            {maxMonthLabel(roadmap.roadmap_duration)} AI Transformation Journey
          </h2>
          <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 sm:p-8">
            <div className="relative pl-8">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-primary/40" />
              {roadmap.journey.map((phase, idx) => (
                <div key={idx} className="relative mb-8 last:mb-0">
                  <div className="absolute -left-5 top-0.5 h-3 w-3 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.4)]" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {phase.months}
                  </span>
                  <h3 className="text-sm font-bold text-primary mt-1 mb-2">{phase.phase_title}</h3>
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
        </div>

        {/* Projected Landing */}
        <div className="rounded-2xl border border-primary/20 bg-card/40 backdrop-blur-sm p-6 sm:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="text-center shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Projected Landing</span>
              <span className="text-4xl sm:text-5xl font-extrabold text-primary block">{roadmap.target_state || roadmap.target_stage_name}</span>
              <span className="text-xs font-medium text-primary/70 mt-1 block">Target Score: {roadmap.target_score_range || roadmap.target_score.toFixed(1)}</span>
            </div>
            <div className="hidden sm:block h-16 w-px bg-border/40" />
            <p className="text-sm text-muted-foreground leading-relaxed">{roadmap.projected_landing}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="ey" size="lg" disabled={sending} onClick={handleRequestDiagnostic}>
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending request…</> : <><Send className="h-4 w-4 mr-2" /> Request full diagnostic</>}
          </Button>
          <Button variant="outline" size="lg" onClick={() => { navigate("/"); window.scrollTo(0, 0); }}>
            <Home className="h-4 w-4 mr-1" /> Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RoadmapPage;