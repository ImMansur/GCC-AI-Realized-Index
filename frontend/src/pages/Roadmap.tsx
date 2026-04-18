import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Home, Loader2, Send, Settings2, Clock } from "lucide-react";
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

// ---- MATRIX LOGIC (Matches Backend) ----
const getAvailableTargets = (cs: number) => {
  let targets =[];
  
  if (cs < 2.0) targets =[
    { label: "2.0 – 2.5", months: 3 },
    { label: "2.6 – 3.0", months: 6 },
    { label: "3.1 – 3.5", months: 9 },
    { label: "3.6 – 4.0", months: 12 }
  ];
  else if (cs < 3.0) targets =[
    { label: "2.5 – 3.0", months: 3 },
    { label: "3.1 – 3.5", months: 6 },
    { label: "3.6 – 4.0", months: 9 },
    { label: "4.1 – 4.5", months: 12 }
  ];
  else if (cs < 4.0) targets =[
    { label: "3.5 – 4.0", months: 3 },
    { label: "4.1 – 4.5", months: 6 },
    { label: "4.6 – 4.8", months: 9 },
    { label: "4.6 – 5.0", months: 12 }
  ];
  else if (cs < 4.5) targets =[
    { label: "4.1 – 4.5", months: 3 },
    { label: "4.6 – 4.8", months: 6 },
    { label: "4.7 – 5.0", months: 9 },
    { label: "5.0", months: 12 }
  ];
  else targets =[
    { label: "4.6 – 5.0", months: 6 },
    { label: "5.0", months: 9 },
    { label: "5.0 (maintain)", months: 12 }
  ];

  // Fix: Format score exactly as it appears in UI (e.g., 3.98 becomes 4.0)
  const visualScore = Number(cs.toFixed(1));

  // Filter out any target range where the maximum achievable score 
  // is less than or equal to what the user already has.
  targets = targets.filter((t) => {
    // Extract all numbers from the target label (e.g., "3.5 - 4.0" ->[3.5, 4.0])
    const numbers = t.label.match(/\d+\.\d+/g);
    if (!numbers) return true; // Safety fallback
    
    // Find the highest number in that target range
    const maxTargetValue = Math.max(...numbers.map(Number));
    
    // Keep it ONLY if it improves their score, or if they are already maxed out
    return maxTargetValue > visualScore || t.label.includes("maintain");
  });

  // Edge case fallback (prevents empty dropdowns)
  if (targets.length === 0) {
    targets =[{ label: "5.0 (maintain)", months: 6 }];
  }

  return targets;
};

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

  // State Management
  const [isConfiguring, setIsConfiguring] = useState(!preGeneratedRoadmap);
  const [selectedTargetLabel, setSelectedTargetLabel] = useState<string>("");
  const [roadmap, setRoadmap] = useState<Roadmap | null>(preGeneratedRoadmap || null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Initialize Configurator Default Values
  useEffect(() => {
    if (scores && isConfiguring) {
      const targets = getAvailableTargets(scores.composite_score);
      const defaultTarget = targets.find(t => t.months === 6) || targets[0];
      setSelectedTargetLabel(defaultTarget.label);
    }
  }, [scores, isConfiguring]);

  // Derived Values automatically calculated based on selection
  const targetsMatrix = scores ? getAvailableTargets(scores.composite_score) :[];
  const activeTargetObj = targetsMatrix.find(t => t.label === selectedTargetLabel) || targetsMatrix[0];
  const activeDurationMonths = activeTargetObj?.months || 6;

  // Generate Action
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
          duration_months: activeDurationMonths, // Auto-calculated!
          dimensions: scores.dimensions,
          uid: auth.currentUser?.uid || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate roadmap");
      const data = await res.json();
      setRoadmap(data.roadmap);

      // Persist roadmap to the user's latest survey so it loads on re-login
      const uid = auth.currentUser?.uid;
      if (uid) {
        try {
          await fetch(`${API_BASE}/api/users/${uid}/surveys/latest/roadmap`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roadmap: data.roadmap }),
          });
        } catch {
          // best-effort save
        }
      }

      // Send the completion email now that the roadmap is ready
      try {
        await fetch(`${API_BASE}/api/survey/send-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: auth.currentUser?.uid || "",
            persona,
            role,
            scores,
            insights: insights || {},
            roadmap: data.roadmap,
            answers: answers || [],
          }),
        });
      } catch {
        // email is best-effort, don't block the user
      }
    } catch (err: any) {
      toast.error("Failed to generate roadmap. Please try again.");
      setIsConfiguring(true); // Return to configurator on fail
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
            Your current baseline score is <span className="font-bold text-foreground">{scores.composite_score.toFixed(1)}</span>. 
            Select your target ambition to see the required timeline and generate your personalized plan.
          </p>

          <div className="space-y-6">
            {/* Target Selection Dropdown */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Target Score Ambition
              </label>
              <select 
                value={selectedTargetLabel}
                onChange={(e) => setSelectedTargetLabel(e.target.value)}
                className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground font-medium focus:ring-1 focus:ring-primary outline-none"
              >
                {targetsMatrix.map((t) => (
                  <option key={t.label} value={t.label}>Target Score: {t.label}</option>
                ))}
              </select>
            </div>

            {/* Dynamic Duration Indicator (Replaces the 2nd Dropdown) */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Estimated Timeline Required
              </label>
              <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">To reach {activeTargetObj?.label}</span>
                </div>
                <span className="text-xl font-bold text-primary">
                  {activeDurationMonths} Months
                </span>
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
            <p className="text-sm text-muted-foreground">Aligning {activeDurationMonths} months of actions for {role} in {persona}</p>
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
        <div className="flex justify-between items-center mb-8">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground group" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1 transition-transform group-hover:-translate-x-1" /> Back
            </Button>
            
            {/* Re-configure button */}
            <Button variant="outline" size="sm" onClick={() => { setRoadmap(null); setIsConfiguring(true); }}>
            <Settings2 className="h-4 w-4 mr-1" /> Re-Configure Target
            </Button>
        </div>

        {/* ═══ Header ═══ */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-px w-6 bg-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.2em]">Your AI Transformation Roadmap</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {persona}'s path to {roadmap.target_stage_name}
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
            <div className="text-center px-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Current Score</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-foreground">{scores.composite_score.toFixed(1)}</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">Stage {currentStage} — {currentStageLabel}</span>
            </div>
            <div className="text-center px-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Target Range</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-primary">{roadmap.target_score_range || roadmap.target_score.toFixed(1)}</span>
              <span className="text-[11px] text-primary/70 block mt-0.5">{roadmap.target_stage_name}</span>
            </div>
            <div className="text-center px-4">
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
              <span className="text-4xl sm:text-5xl font-extrabold text-primary block">{roadmap.target_score_range || roadmap.target_score.toFixed(1)}</span>
              <span className="text-xs font-medium text-primary/70 mt-1 block">{roadmap.target_stage_name}</span>
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