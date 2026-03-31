import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Star, Shield, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
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

/* ── Fake benchmark data ── */
const BENCHMARK = {
  leading_quartile: 3.4,
  median: 2.6,
  lagging_quartile: 1.8,
  sector_average: 2.4,
};

const DIMENSION_ICONS: Record<number, string> = {
  1: "🎯", 2: "⚙️", 3: "🎓", 4: "🖥️", 5: "🏢",
  6: "📊", 7: "📈", 8: "🛡️", 9: "⚠️",
};

/* ── Component ── */

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { scores, insights, persona, role, answers } = (location.state || {}) as {
    scores?: Scores;
    insights?: Record<string, string[]>;
    persona?: string;
    role?: string;
    answers?: any[];
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

  const stage = getStage(scores.composite_score);
  const radarData = scores.dimensions.map((d) => ({
    dimension: d.dimension_name,
    score: d.score,
    fullMark: 5,
  }));

  // Stage map position (0-100%)
  const stageMapPct = ((scores.composite_score - 1) / 4) * 100;
  const medianPct = ((BENCHMARK.median - 1) / 4) * 100;

  return (
    <div className="min-h-screen bg-mesh-gradient p-6 relative overflow-hidden">
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
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Indicative AI Readiness Score
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Based on your responses, here is your GARIX profile across all 9 dimensions.
            These are indicative scores — the full EY GARIX diagnostic covers 63 questions
            across 7 stakeholder profiles and 45 sub-dimensions.
          </p>
        </div>

        {/* ═══ Section 1: Radar + Composite + Dimension Bars ═══ */}
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Radar Chart */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                9-Dimension Radar
              </h3>
              <div className="w-full aspect-square max-w-[380px] mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.3} />
                    <PolarAngleAxis
                      dataKey="dimension"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
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
                    <div key={d.dimension_id} className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 w-[160px] shrink-0">
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
          <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 mb-8">
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
        <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 mb-8">
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
                <div key={s.stage} className="text-center flex-1">
                  <p className="text-[10px] font-semibold text-muted-foreground">{s.label}</p>
                  <p className="text-[9px] text-muted-foreground/60">{s.range}</p>
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
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/50" />
              <span className="text-sm font-medium text-foreground flex-1">Your GARIX Score</span>
              <span className="text-lg font-bold text-foreground">
                {scores.composite_score.toFixed(1)}
              </span>
            </div>

            {/* Leading quartile */}
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/50" />
              <span className="text-sm font-medium text-foreground flex-1">
                India GCC — Leading quartile
              </span>
              <span className="text-lg font-bold text-foreground">
                {BENCHMARK.leading_quartile.toFixed(1)}
              </span>
              <span className="text-xs font-bold text-emerald-400 ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
                +{(BENCHMARK.leading_quartile - scores.composite_score).toFixed(1)} ahead
              </span>
            </div>

            {/* Median */}
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-sm font-medium text-foreground flex-1">
                India GCC — Median
              </span>
              <span className="text-lg font-bold text-foreground">
                {BENCHMARK.median.toFixed(1)}
              </span>
              <span className={`text-xs font-bold ml-2 rounded-full border px-2 py-0.5 ${
                scores.composite_score >= BENCHMARK.median
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
              }`}>
                {scores.composite_score >= BENCHMARK.median
                  ? `+${(scores.composite_score - BENCHMARK.median).toFixed(1)} ahead`
                  : `+${(BENCHMARK.median - scores.composite_score).toFixed(1)} ahead`}
              </span>
            </div>

            {/* Lagging quartile */}
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/50" />
              <span className="text-sm font-medium text-foreground flex-1">
                India GCC — Lagging quartile
              </span>
              <span className="text-lg font-bold text-foreground">
                {BENCHMARK.lagging_quartile.toFixed(1)}
              </span>
              <span className={`text-xs font-bold ml-2 rounded-full border px-2 py-0.5 ${
                scores.composite_score >= BENCHMARK.lagging_quartile
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-red-400 border-red-500/30 bg-red-500/10"
              }`}>
                {scores.composite_score >= BENCHMARK.lagging_quartile
                  ? `+${(scores.composite_score - BENCHMARK.lagging_quartile).toFixed(1)} ahead`
                  : `-${(BENCHMARK.lagging_quartile - scores.composite_score).toFixed(1)} gap`}
              </span>
            </div>

            {/* Banking sector average */}
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/50" />
              <span className="text-sm font-medium text-foreground flex-1">
                Banking sector average
              </span>
              <span className="text-lg font-bold text-foreground">
                {BENCHMARK.sector_average.toFixed(1)}
              </span>
              <span className={`text-xs font-bold ml-2 rounded-full border px-2 py-0.5 ${
                scores.composite_score >= BENCHMARK.sector_average
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
              }`}>
                {scores.composite_score >= BENCHMARK.sector_average
                  ? `+${(scores.composite_score - BENCHMARK.sector_average).toFixed(1)} ahead`
                  : `+${(BENCHMARK.sector_average - scores.composite_score).toFixed(1)} ahead`}
              </span>
            </div>
          </div>
        </div>

        {/* Contextual Callout */}
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 backdrop-blur-sm p-6 mb-8">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-bold text-yellow-400">
              {scores.composite_score < BENCHMARK.median
                ? `You're below the India GCC median`
                : `You're above the India GCC median`}
            </span>
            {" "}at {scores.composite_score.toFixed(1)} vs {BENCHMARK.median.toFixed(1)}.
            {scores.composite_score < BENCHMARK.median
              ? ` This is common — over 60% of India GCCs are in AI Aware or early AI Embedded. The gap to median is ${(BENCHMARK.median - scores.composite_score).toFixed(1)} points — achievable within 6–9 months with the right foundation investments.`
              : ` You're ahead of the cohort median. Focus on scaling your strongest dimensions to move toward AI Native maturity.`}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pb-8">
          <Button
            variant="ghost"
            size="lg"
            className="text-muted-foreground hover:text-foreground group"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-1 transition-transform group-hover:-translate-x-1" />
            Back
          </Button>
          <Button
            variant="ey"
            size="lg"
            className="shimmer"
            onClick={() => navigate("/roadmap", { state: { scores, insights, persona, role, answers } })}
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
