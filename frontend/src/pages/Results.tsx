import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Star, Shield, TrendingUp, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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

/* ── Stage helpers ── */

const STAGES = [
  { stage: 1, label: "AI Aware", range: "1–2" },
  { stage: 2, label: "AI Embedded", range: "2–3" },
  { stage: 3, label: "AI Scaled", range: "3–4" },
  { stage: 4, label: "AI Native", range: "4–4.5" },
  { stage: 5, label: "AI Realized", range: "4.5–5" },
];

function getStage(score: number) {
  if (score < 2) return STAGES[0];
  if (score < 3) return STAGES[1];
  if (score < 4) return STAGES[2];
  if (score < 4.5) return STAGES[3];
  return STAGES[4];
}

function getBarColor(score: number): string {
  if (score < 2) return "bg-red-500";
  if (score < 3) return "bg-orange-500";
  if (score < 4) return "bg-yellow-500";
  if (score < 4.5) return "bg-blue-500";
  return "bg-emerald-500";
}

/* ── Role-specific benchmark data ── */
const BENCHMARK_BY_ROLE: Record<string, { median: number; leading_quartile: number; lagging_quartile: number }> = {
  // GCC Leadership
  "GCC Head":                          { median: 3.1, leading_quartile: 3.3, lagging_quartile: 2.2 },
  "Managing Director (MD)":            { median: 3.1, leading_quartile: 3.3, lagging_quartile: 2.2 },
  "Chief Operating Officer (COO)":     { median: 3.1, leading_quartile: 3.3, lagging_quartile: 2.2 },
  "Strategy Officer":                  { median: 3.2, leading_quartile: 3.4, lagging_quartile: 2.2 },
  // Tech Leadership
  "CIO":                               { median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  "CTO/VP Engineering":                { median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  "Head of IT":                        { median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  // Data Leadership
  "Head of Data":                      { median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  "Chief Data Officer":                { median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  "Analytics Lead":                    { median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  // AI/ML Practitioners
  "Data Scientists":                   { median: 3.2, leading_quartile: 3.4, lagging_quartile: 2.2 },
  "ML Engineers":                      { median: 3.2, leading_quartile: 3.4, lagging_quartile: 2.2 },
  "AI CoE":                            { median: 3.2, leading_quartile: 3.4, lagging_quartile: 2.2 },
  // HR & Talent Leadership
  "CHRO / VP HR":                      { median: 2.8, leading_quartile: 3.1, lagging_quartile: 2.0 },
  "Head of L&D":                       { median: 2.8, leading_quartile: 3.1, lagging_quartile: 2.0 },
  "Talent Acquisition":                { median: 2.7, leading_quartile: 3.1, lagging_quartile: 2.0 },
  // Function & Business Leaders
  "Head of Finance Ops":               { median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  "Operations Lead":                   { median: 2.9, leading_quartile: 3.2, lagging_quartile: 2.0 },
  "Head of Procurement & Supply Chain":{ median: 3.0, leading_quartile: 3.3, lagging_quartile: 2.1 },
  // Risk, Legal & Compliance
  "General Counsel":                   { median: 2.4, leading_quartile: 3.0, lagging_quartile: 1.9 },
  "Head of Risk":                      { median: 2.6, leading_quartile: 3.0, lagging_quartile: 2.0 },
  "Compliance Officer":                { median: 2.4, leading_quartile: 3.0, lagging_quartile: 1.9 },
};

const DEFAULT_BENCHMARK = { median: 2.9, leading_quartile: 3.3, lagging_quartile: 2.1 };

function getBenchmark(role?: string) {
  if (role && BENCHMARK_BY_ROLE[role]) return BENCHMARK_BY_ROLE[role];
  return DEFAULT_BENCHMARK;
}

/** Estimate the shortest duration (months) to reach a target score using the roadmap matrix. */
function estimateMonthsToReach(currentScore: number, targetScore: number): number | null {
  const durations = [3, 6, 9, 12] as const;
  let matrix: Record<number, [number, number]>;

  if (currentScore < 2.0)
    matrix = { 3: [2.0, 2.5], 6: [2.6, 3.0], 9: [3.1, 3.5], 12: [3.6, 4.0] };
  else if (currentScore < 3.0)
    matrix = { 3: [2.5, 3.0], 6: [3.1, 3.5], 9: [3.6, 4.0], 12: [4.1, 4.5] };
  else if (currentScore < 4.0)
    matrix = { 3: [3.5, 4.0], 6: [4.1, 4.5], 9: [4.6, 4.8], 12: [4.6, 5.0] };
  else if (currentScore < 4.5)
    matrix = { 3: [4.1, 4.5], 6: [4.6, 4.8], 9: [4.7, 5.0], 12: [5.0, 5.0] };
  else
    matrix = { 6: [4.6, 5.0], 9: [5.0, 5.0], 12: [5.0, 5.0] };

  for (const d of durations) {
    const range = matrix[d];
    if (!range) continue;
    if (range[1] >= targetScore) return d;
  }
  return null; // beyond 12 months
}

const DIMENSION_ICONS: Record<number, string> = {
  1: "🎯", 2: "⚙️", 3: "🎓", 4: "🖥️", 5: "🏢",
  6: "📊", 7: "📈", 8: "🛡️", 9: "⚠️",
};

/* ── Component ── */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const stateData = (location.state || {}) as {
    scores?: Scores;
    insights?: Record<string, string[]>;
    persona?: string;
    role?: string;
    answers?: any[];
    roadmap?: any;
  };

  const [scores, setScores] = useState<Scores | undefined>(stateData.scores);
  const [insights, setInsights] = useState<Record<string, string[]> | undefined>(stateData.insights);
  const [persona, setPersona] = useState<string | undefined>(stateData.persona);
  const [role, setRole] = useState<string | undefined>(stateData.role);
  const [answers, setAnswers] = useState<any[] | undefined>(stateData.answers);
  const [roadmap, setRoadmap] = useState<any>(stateData.roadmap);
  const [loadingResults, setLoadingResults] = useState(!stateData.scores);
  const [benchmark, setBenchmark] = useState(() => getBenchmark(stateData.role));
  const [sectorName, setSectorName] = useState<string | null>(null);
  const SECTOR_AVERAGE = 3.0;

  const [radius, setRadius] = useState(45);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setRadius(35); // mobile
      } else if (window.innerWidth < 1024) {
        setRadius(40); // tablet
      } else {
        setRadius(45); // desktop
      }
    };

    handleResize(); // run once
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch dynamic benchmarks from backend when role is available
  useEffect(() => {
    if (!role) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/benchmarks/${encodeURIComponent(role)}`);
        if (res.ok) {
          const data = await res.json();
          setBenchmark({
            median: data.median,
            leading_quartile: data.leading_quartile,
            lagging_quartile: data.lagging_quartile,
          });
        }
      } catch {
        // Keep static fallback
      }
    })();
  }, [role]);

  // Fetch user profile to get sector (parent_industry)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users/${uid}/profile`);
        if (res.ok) {
          const data = await res.json();
          if (data.parent_industry) setSectorName(data.parent_industry);
        }
      } catch {
        // Keep null
      }
    })();
  }, []);

  useEffect(() => {
    // If we already have scores from navigation state, no need to fetch
    if (stateData.scores) return;

    const fetchLatest = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        // Wait for auth to initialize
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
          unsubscribe();
          if (!user) {
            navigate("/login");
            return;
          }
          await loadLatestSurvey(user.uid);
        });
        return;
      }
      await loadLatestSurvey(uid);
    };

    const loadLatestSurvey = async (uid: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/users/${uid}/surveys/latest`);
        if (!res.ok) throw new Error("Failed to fetch results");
        const data = await res.json();
        if (data.survey) {
          setScores(data.survey.scores);
          setInsights(data.survey.insights);
          setPersona(data.survey.persona);
          setRole(data.survey.role);
          setAnswers(data.survey.answers);
          if (data.survey.roadmap) {
            setRoadmap(data.survey.roadmap);
          }
        }
      } catch {
        // No results found
      } finally {
        setLoadingResults(false);
      }
    };

    fetchLatest();
  }, []);

  if (loadingResults) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center p-6 relative overflow-hidden">
        <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
        <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left=[-5%]" />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading your results...</p>
        </div>
      </div>
    );
  }

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

  const stage = getStage(scores.composite_score);
  const radarData = scores.dimensions.map((d) => ({
    dimension: d.dimension_name,
    score: d.score,
    fullMark: 5,
  }));

  // Stage map position (0-100%)
  const stageMapPct = ((scores.composite_score - 1) / 4) * 100;
  const medianPct = ((benchmark.median - 1) / 4) * 100;

  return (
    <div className="min-h-screen bg-mesh-gradient px-3 py-6 sm:p-6 relative overflow-hidden">
      <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
      <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="h-px w-6 bg-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.2em]">
              Your GARIX Profile
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Indicative AI Realization Score
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Based on your responses, here is your GARIX profile across all 9 dimensions.
            These are preliminary scores — the full EY GARIX diagnostic covers 189 questions
            across 7 stakeholder x 9 dimensions x 3 sub-dimensions per dimension
          </p>
        </div>

        {/* ═══ Section 1: Radar + Composite + Dimension Bars ═══ */}
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-4 sm:p-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Radar Chart */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                9-Dimension Radar
              </h3>
              <div className="w-full aspect-square max-w-[480px] mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={`${radius}%`}>
                    <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.3} />
                    <PolarAngleAxis
                      dataKey="dimension"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 5]}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                      tickCount={6}
                    />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "#fff" }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right: Composite Score + Dimension Bars */}
            <div>
              {/* Composite */}
              <div className="text-center mb-6">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold text-primary">
                    {scores.composite_score.toFixed(1)}
                  </span>
                  <span className="text-lg text-muted-foreground">/ 5.0</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Composite GARIX Score</p>
                <div className="inline-block mt-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1">
                  <span className="text-xs font-bold text-primary">
                    Stage {stage.stage} — {stage.label}
                  </span>
                </div>
              </div>

              {/* Dimension bars */}
              <div className="space-y-3">
                {scores.dimensions.map((d) => {
                  const pct = (d.score / 5) * 100;
                  const isWeighted = d.weight > 1;
                  return (
                    <div key={d.dimension_id} className="flex items-center gap-2 sm:gap-3">
                      <div className="flex items-center gap-1.5 w-[100px] sm:w-[160px] shrink-0">
                        <span className="text-sm">{DIMENSION_ICONS[d.dimension_id]}</span>
                        <span className="text-xs font-medium text-foreground truncate">
                          {d.dimension_name}
                        </span>
                        {isWeighted && (
                          <span className="text-[9px] font-bold text-primary">
                            {d.dimension_id === 1 ? (
                              <Star className="h-2.5 w-2.5 inline" />
                            ) : (
                              <Shield className="h-2.5 w-2.5 inline" />
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${getBarColor(d.score)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-foreground w-7 text-right">
                        {d.score.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Section 2: What Each Dimension Looks Like (AI-generated) ═══ */}
        {insights && Object.keys(insights).length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-4 sm:p-6 mb-8">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6">
              What Each Dimension Looks Like at Your Stage
            </h3>
            <div className="space-y-6">
              {scores.dimensions.map((d) => {
                const dimStage = getStage(d.score);
                const descriptions = insights[String(d.dimension_id)] || [];
                return (
                  <div key={d.dimension_id}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-base">{DIMENSION_ICONS[d.dimension_id]}</span>
                      <span className="text-sm font-bold text-foreground">
                        {d.dimension_name}
                      </span>
                      <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Stage {dimStage.stage} · {d.score.toFixed(1)}
                      </span>
                    </div>
                    <ul className="ml-8 space-y-1">
                      {descriptions.map((desc, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span className="text-xs text-muted-foreground">{desc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ Section 3: Maturity Stage Map ═══ */}
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-4 sm:p-6 mb-8">
          <p className="text-xs text-muted-foreground mb-4">
            Your GARIX score benchmarked against EY's India GCC cohort — filtered by industry and GCC size.
          </p>

          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-6">
            Maturity Stage Map — Your Position vs. Cohort
          </h3>

          {/* Stage track */}
          <div className="relative mb-10 mt-12">
            {/* Background line */}
            <div className="h-1 w-full bg-muted/40 rounded-full" />
            {/* Filled portion */}
            <div
              className="absolute top-0 left-0 h-1 bg-primary rounded-full"
              style={{ width: `${Math.min(stageMapPct, 100)}%` }}
            />

            {/* Your position marker */}
            <div
              className="absolute -top-9 flex flex-col items-center"
              style={{ left: `${Math.min(Math.max(stageMapPct, 2), 98)}%`, transform: "translateX(-50%)" }}
            >
              <span className="text-[9px] font-bold text-primary mb-1">YOU</span>
              <div className="h-6 w-6 rounded-full bg-primary border-2 border-background shadow-[0_0_12px_hsl(var(--primary)/0.5)] flex items-center justify-center">
                <span className="text-[8px] font-bold text-primary-foreground">Y</span>
              </div>
            </div>

            {/* Median marker */}
            <div
              className="absolute -top-8 flex flex-col items-center"
              style={{ left: `${Math.min(Math.max(medianPct, 2), 98)}%`, transform: "translateX(-50%)" }}
            >
              <span className="text-[9px] font-medium text-yellow-500 mb-1">MED</span>
              <div className="h-5 w-5 rounded-full bg-yellow-500/80 border-2 border-background flex items-center justify-center">
                <span className="text-[7px] font-bold text-background">M</span>
              </div>
            </div>

            {/* Stage labels */}
            <div className="flex justify-between mt-4">
              {STAGES.map((s) => (
                <div key={s.stage} className="text-center flex-1 min-w-0">
                  <p className="text-[8px] sm:text-[10px] font-semibold text-muted-foreground truncate">{s.label}</p>
                  <p className="text-[7px] sm:text-[9px] text-muted-foreground/60">{s.range}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Benchmark Comparisons */}
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">
            Benchmark Comparisons
          </h3>

          <div className="space-y-3">
            {/* Your score */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-border/50 bg-card/60 p-3 sm:p-4">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/50 shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-foreground flex-1 min-w-0">Your GARIX Score</span>
              <span className="text-base sm:text-lg font-bold text-foreground">
                {scores.composite_score.toFixed(1)}
              </span>
            </div>

            {/* Leading quartile */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-border/50 bg-card/60 p-3 sm:p-4">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/50 shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-foreground flex-1 min-w-0">
                India GCC — Leading quartile
              </span>
              <span className="text-base sm:text-lg font-bold text-foreground">
                {benchmark.leading_quartile.toFixed(1)}
              </span>
              <span className={`text-[10px] sm:text-xs font-bold rounded-full border px-2 py-0.5 ${scores.composite_score >= benchmark.leading_quartile
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                }`}>
                {scores.composite_score >= benchmark.leading_quartile
                  ? `+${(scores.composite_score - benchmark.leading_quartile).toFixed(1)} ahead`
                  : `-${(benchmark.leading_quartile - scores.composite_score).toFixed(1)} gap`}
              </span>
            </div>

            {/* Median */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-border/50 bg-card/60 p-3 sm:p-4">
              <div className="h-3 w-3 rounded-full bg-yellow-500 shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-foreground flex-1 min-w-0">
                India GCC — Median
              </span>
              <span className="text-base sm:text-lg font-bold text-foreground">
                {benchmark.median.toFixed(1)}
              </span>
              <span className={`text-[10px] sm:text-xs font-bold rounded-full border px-2 py-0.5 ${scores.composite_score >= benchmark.median
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                }`}>
                {scores.composite_score >= benchmark.median
                  ? `+${(scores.composite_score - benchmark.median).toFixed(1)} ahead`
                  : `-${(benchmark.median - scores.composite_score).toFixed(1)} gap`}
              </span>
            </div>

            {/* Lagging quartile */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-border/50 bg-card/60 p-3 sm:p-4">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/50 shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-foreground flex-1 min-w-0">
                India GCC — Lagging quartile
              </span>
              <span className="text-base sm:text-lg font-bold text-foreground">
                {benchmark.lagging_quartile.toFixed(1)}
              </span>
              <span className={`text-[10px] sm:text-xs font-bold rounded-full border px-2 py-0.5 ${scores.composite_score >= benchmark.lagging_quartile
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-red-400 border-red-500/30 bg-red-500/10"
                }`}>
                {scores.composite_score >= benchmark.lagging_quartile
                  ? `+${(scores.composite_score - benchmark.lagging_quartile).toFixed(1)} ahead`
                  : `-${(benchmark.lagging_quartile - scores.composite_score).toFixed(1)} gap`}
              </span>
            </div>

            {/* GCC Sector Average */}
            {sectorName && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-border/50 bg-card/60 p-3 sm:p-4">
                <div className="h-3 w-3 rounded-full bg-blue-500 shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-foreground flex-1 min-w-0">
                  GCC Sector Avg — {sectorName}
                </span>
                <span className="text-base sm:text-lg font-bold text-foreground">
                  {SECTOR_AVERAGE.toFixed(1)}
                </span>
                <span className={`text-[10px] sm:text-xs font-bold rounded-full border px-2 py-0.5 ${scores.composite_score >= SECTOR_AVERAGE
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : "text-blue-400 border-blue-500/30 bg-blue-500/10"
                  }`}>
                  {scores.composite_score >= SECTOR_AVERAGE
                    ? `+${(scores.composite_score - SECTOR_AVERAGE).toFixed(1)} ahead`
                    : `-${(SECTOR_AVERAGE - scores.composite_score).toFixed(1)} gap`}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Industry trend insight */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-sm p-4 sm:p-6 mb-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Industry trend shows many GCCs are progressing toward
            <span className="font-semibold text-primary"> Stage 3 — AI Scaled</span>,
            where organizations move beyond experimentation and begin scaling AI use cases
            across functions with stronger data and platform foundations.
          </p>
        </div>

        {/* Contextual Callout */}
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 backdrop-blur-sm p-4 sm:p-6 mb-8">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {(() => {
              const cs = scores.composite_score;
              const med = benchmark.median;
              const stage = getStage(cs);
              const gap = Math.abs(cs - med);

              if (cs < med) {
                const months = estimateMonthsToReach(cs, med);
                const timelineText = months
                  ? months <= 6 ? `${months} months` : `${months} months`
                  : "12+ months";
                return (
                  <>
                    <span className="font-bold text-yellow-400">You're below the India GCC median</span>
                    {" "}at {cs.toFixed(1)} vs {med.toFixed(1)}.
                    {" "}You're currently in <span className="font-semibold text-primary">Stage {stage.stage} — {stage.label}</span>.
                    {" "}The gap to median is {gap.toFixed(1)} points — achievable within {timelineText} with the right foundation investments.
                  </>
                );
              } else if (cs < benchmark.leading_quartile) {
                const months = estimateMonthsToReach(cs, benchmark.leading_quartile);
                const timelineText = months ? `${months} months` : "12+ months";
                return (
                  <>
                    <span className="font-bold text-emerald-400">You're above the India GCC median</span>
                    {" "}at {cs.toFixed(1)} vs {med.toFixed(1)}.
                    {" "}You're in <span className="font-semibold text-primary">Stage {stage.stage} — {stage.label}</span>.
                    {" "}To reach the leading quartile ({benchmark.leading_quartile.toFixed(1)}), focus on scaling your strongest dimensions — estimated {timelineText} with targeted investments.
                  </>
                );
              } else {
                return (
                  <>
                    <span className="font-bold text-emerald-400">You're in the leading quartile</span>
                    {" "}at {cs.toFixed(1)} vs median {med.toFixed(1)}.
                    {" "}You're in <span className="font-semibold text-primary">Stage {stage.stage} — {stage.label}</span>.
                    {" "}Focus on optimizing and scaling your AI capabilities to advance toward AI Realized maturity.
                  </>
                );
              }
            })()}
          </p>
        </div>
        {/* Guardrail explanation */}
        <div className="text-xs text-muted-foreground max-w-3xl mb-10">
          These insights are generated using structured scoring logic aligned to the EY GARIX maturity framework.
          Results are preliminary indicators of AI realization maturity and should be validated through deeper
          diagnostic workshops and stakeholder alignment sessions.
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pb-8">
          <Button
            variant="ghost"
            size="lg"
            className="text-muted-foreground hover:text-foreground group w-full sm:w-auto"
            onClick={() => navigate("/designation")}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Retake Assessment
          </Button>
          <Button
            variant="ey"
            size="lg"
            className="shimmer w-full sm:w-auto"
            onClick={() => navigate("/roadmap", { state: { scores, insights, persona, role, answers, roadmap } })}
          >
            Get your AI roadmap
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Results;
