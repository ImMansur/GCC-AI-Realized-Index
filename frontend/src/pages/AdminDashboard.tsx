import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/firebase";
import {
  Users,
  FileBarChart,
  TrendingUp,
  LogOut,
  ChevronDown,
  Search,
  BarChart3,
  Shield,
  Compass,
  Target,
  Download,
  FileText,
  Eye,
  Activity,
  Award,
  RefreshCcw,
  Calendar,
  Building2,
  MapPin,
  Briefcase,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface DimensionScore {
  dimension_id: number;
  dimension_name: string;
  score: number;
  weight: number;
  weighted_score: number;
}

interface AnswerOption {
  value: number;
  label: string;
  description: string;
}

interface AnswerItem {
  dimension_id: number;
  dimension_name: string;
  question: string;
  selected_option: number;
  option_label: string;
  option_description: string;
  all_options?: AnswerOption[];
}

interface SurveyRecord {
  id: string;
  uid: string;
  persona: string;
  role: string;
  scores: {
    dimensions: DimensionScore[];
    composite_score: number;
    total_weighted: number;
    total_weight: number;
  };
  insights: Record<string, string[]>;
  answers?: AnswerItem[];
  submitted_at: string;
}

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  company?: string;
  gcc_location?: string;
  gcc_size?: string;
  parent_industry?: string;
}

interface Stats {
  total_users: number;
  total_surveys: number;
  average_score: number;
  stage_distribution: Record<string, number>;
  persona_distribution: Record<string, number>;
}

interface RoadmapAction {
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

interface RoadmapData {
  target_score: number;
  target_stage_name: string;
  actions: RoadmapAction[];
  journey: JourneyPhase[];
  projected_landing: string;
}

interface RoadmapRecord {
  id: string;
  uid: string;
  persona: string;
  role: string;
  composite_score: number;
  roadmap: RoadmapData;
  generated_at: string;
}

interface ReportRecord {
  id: string;
  user_name: string;
  user_email: string;
  persona: string;
  role: string;
  composite_score: number;
  stage: string;
  blob_name: string;
  requested_at: string;
}

function getStageLabel(score: number): string {
  if (score < 2) return "AI Aware";
  if (score < 3) return "AI Embedded";
  if (score < 4) return "AI Scaled";
  if (score < 4.5) return "AI Native";
  return "AI Realized";
}

function getStageBadgeColor(stage: string): string {
  switch (stage) {
    case "AI Aware":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "AI Embedded":
      return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "AI Scaled":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    case "AI Native":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "AI Realized":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    default:
      return "bg-gray-500/10 text-gray-400 border-gray-500/20";
  }
}

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#10b981"];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roadmaps, setRoadmaps] = useState<RoadmapRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "surveys" | "users" | "reports">("overview");
  const [dynamicBenchmarks, setDynamicBenchmarks] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }
    fetchAll();
  }, []);

  async function getHeaders() {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const [statsRes, surveysRes, usersRes, roadmapsRes, reportsRes, benchmarkSettingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { headers }),
        fetch(`${API_BASE}/api/admin/surveys`, { headers }),
        fetch(`${API_BASE}/api/admin/users`, { headers }),
        fetch(`${API_BASE}/api/admin/roadmaps`, { headers }),
        fetch(`${API_BASE}/api/admin/reports`, { headers }),
        fetch(`${API_BASE}/api/admin/settings/benchmarks`, { headers }),
      ]);

      if (statsRes.status === 401 || surveysRes.status === 401 || usersRes.status === 401 || roadmapsRes.status === 401 || reportsRes.status === 401) {
        sessionStorage.removeItem("admin_token");
        toast.error("Session expired. Please login again.");
        navigate("/login");
        return;
      }

      const [statsData, surveysData, usersData, roadmapsData, reportsData] = await Promise.all([
        statsRes.json(),
        surveysRes.json(),
        usersRes.json(),
        roadmapsRes.json(),
        reportsRes.json(),
      ]);

      setStats(statsData);
      setSurveys(surveysData.surveys || []);
      setUsers(usersData.users || []);
      setRoadmaps(roadmapsData.roadmaps || []);
      setReports(reportsData.reports || []);

      if (benchmarkSettingsRes.ok) {
        const bsData = await benchmarkSettingsRes.json();
        setDynamicBenchmarks(bsData.dynamic_enabled ?? false);
      }
    } catch {
      toast.error("Failed to fetch admin data");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await auth.signOut();
    } catch { /* ignore */ }
    sessionStorage.removeItem("admin_token");
    navigate("/login");
  }

  const filteredSurveys = surveys.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.uid.toLowerCase().includes(q) ||
      s.persona.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      getStageLabel(s.scores.composite_score).toLowerCase().includes(q)
    );
  });

  // Build user lookup
  const userMap = new Map(users.map((u) => [u.uid, u]));

  // Stage distribution chart data — filter out stages with 0 count
  const stageChartData = stats
    ? Object.entries(stats.stage_distribution)
        .map(([name, value]) => ({ name, value }))
        .filter((d) => d.value > 0)
    : [];

  // Persona distribution chart data
  const personaChartData = stats
    ? Object.entries(stats.persona_distribution).map(([name, value]) => ({ name, value }))
    : [];

  // Map stage names to consistent colors
  const STAGE_COLOR_MAP: Record<string, string> = {
    "AI Aware": "#ef4444",
    "AI Embedded": "#f97316",
    "AI Scaled": "#eab308",
    "AI Native": "#3b82f6",
    "AI Realized": "#10b981",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading admin dashboard…</p>
        </div>
      </div>
    );
  }

  // Build dimension averages for overview radar
  const avgDimData = (() => {
    const dimTotals: Record<string, { total: number; count: number }> = {};
    surveys.forEach((s) => {
      s.scores.dimensions.forEach((d) => {
        if (!dimTotals[d.dimension_name]) dimTotals[d.dimension_name] = { total: 0, count: 0 };
        dimTotals[d.dimension_name].total += d.score;
        dimTotals[d.dimension_name].count += 1;
      });
    });
    return Object.entries(dimTotals).map(([name, { total, count }]) => ({
      dimension: name,
      score: parseFloat((total / count).toFixed(2)),
      fullMark: 5,
    }));
  })();

  // Score distribution for sparkline-style display
  const highestAvgDim = avgDimData.length > 0 ? avgDimData.reduce((a, b) => (a.score > b.score ? a : b)) : null;
  const lowestAvgDim = avgDimData.length > 0 ? avgDimData.reduce((a, b) => (a.score < b.score ? a : b)) : null;

  return (
    <div className="min-h-screen bg-mesh-gradient relative overflow-hidden">
      <div className="orb orb-gold w-[400px] h-[400px] top-[-5%] right-[-8%] opacity-30" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[5%] left-[-5%] opacity-20" />

      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-2xl">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
              <span className="text-sm font-extrabold text-primary-foreground tracking-tight">EY</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground tracking-wide">
                  GARIX Command Center
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-primary/80 border border-primary/20 bg-primary/5 rounded-full px-2 py-0.5">
                  <Shield className="h-2.5 w-2.5" /> MD
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">GCC AI Realized Index Administration</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchAll()}
              className="text-muted-foreground hover:text-foreground h-8 px-2"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground h-8">
              <LogOut className="h-3.5 w-3.5 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 relative z-10">

        {/* ═══ Stat Cards (redesigned with accent bars & contextual info) ═══ */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total Users */}
            <div className="group rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md p-5 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/60">Users</span>
              </div>
              <div className="text-3xl font-extrabold text-foreground tracking-tight">{stats.total_users}</div>
              <div className="text-[11px] text-muted-foreground mt-1">registered participants</div>
            </div>

            {/* Total Surveys */}
            <div className="group rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md p-5 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <FileBarChart className="h-5 w-5 text-emerald-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/60">Surveys</span>
              </div>
              <div className="text-3xl font-extrabold text-foreground tracking-tight">{stats.total_surveys}</div>
              <div className="text-[11px] text-muted-foreground mt-1">assessments completed</div>
            </div>

            {/* Avg Score */}
            <div className="group rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md p-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Avg Score</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground tracking-tight">{stats.average_score}</span>
                <span className="text-sm text-muted-foreground font-medium">/ 5.0</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(stats.average_score / 5) * 100}%` }} />
              </div>
            </div>

            {/* Reports */}
            <div className="group rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md p-5 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-purple-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400/60">Reports</span>
              </div>
              <div className="text-3xl font-extrabold text-foreground tracking-tight">{reports.length}</div>
              <div className="text-[11px] text-muted-foreground mt-1">diagnostic requests</div>
            </div>
          </div>
        )}

        {/* ═══ Tab Navigation (pill style with icons & counts) ═══ */}
        <div className="flex gap-1 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md p-1.5 mb-6 w-fit">
          {([
            { key: "overview" as const, label: "Overview", icon: Activity, count: null },
            { key: "surveys" as const, label: "Surveys", icon: FileBarChart, count: surveys.length },
            { key: "users" as const, label: "Users", icon: Users, count: users.length },
            { key: "reports" as const, label: "Reports", icon: FileText, count: reports.length },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count !== null && (
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                  tab === t.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-white/[0.05] text-muted-foreground"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════ */}
        {/* OVERVIEW TAB                           */}
        {/* ═══════════════════════════════════════ */}
        {tab === "overview" && stats && (
          <div className="space-y-6">
            {/* Top row — Highlights strip */}
            {(highestAvgDim || lowestAvgDim) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-5 flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-0.5">Strongest Dimension</div>
                    <div className="text-sm font-bold text-foreground truncate">{highestAvgDim?.dimension}</div>
                    <div className="text-xs text-muted-foreground">{highestAvgDim?.score}/5.0 avg</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-5 flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-0.5">Needs Attention</div>
                    <div className="text-sm font-bold text-foreground truncate">{lowestAvgDim?.dimension}</div>
                    <div className="text-xs text-muted-foreground">{lowestAvgDim?.score}/5.0 avg</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-5 flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-0.5">Personas Tracked</div>
                    <div className="text-sm font-bold text-foreground">{Object.keys(stats.persona_distribution).length} types</div>
                    <div className="text-xs text-muted-foreground">{stats.total_surveys} total surveys</div>
                  </div>
                </div>
              </div>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Stage Distribution */}
              <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">Stage Distribution</h3>
                  <span className="text-[10px] text-muted-foreground">{stageChartData.length} stages active</span>
                </div>
                {stageChartData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={stageChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {stageChartData.map((entry) => (
                            <Cell key={entry.name} fill={STAGE_COLOR_MAP[entry.name] || "#888"} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                          labelStyle={{ color: "#fff" }}
                          itemStyle={{ color: "#fff" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Custom legend */}
                    <div className="flex flex-wrap gap-3 justify-center mt-2">
                      {stageChartData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_COLOR_MAP[entry.name] || "#888" }} />
                          <span className="text-[11px] text-muted-foreground">{entry.name}</span>
                          <span className="text-[11px] font-bold text-foreground">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                )}
              </div>

              {/* Persona Distribution */}
              <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">Surveys by Persona</h3>
                  <span className="text-[10px] text-muted-foreground">{personaChartData.length} personas</span>
                </div>
                {personaChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={personaChartData} layout="vertical" margin={{ left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#666", fontSize: 10 }} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "#aaa", fontSize: 11 }} width={120} />
                      <Tooltip
                        contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: "#fff" }}
                        cursor={{ fill: "rgba(255,230,0,0.03)" }}
                      />
                      <Bar dataKey="value" fill="#ffe600" radius={[0, 6, 6, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                )}
              </div>
            </div>

            {/* Dimension Radar — full width */}
            {avgDimData.length > 0 && (
              <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">Average Dimension Scores</h3>
                  <span className="text-[10px] text-muted-foreground">across {surveys.length} surveys</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                  <ResponsiveContainer width="100%" height={320}>
                    <RadarChart data={avgDimData}>
                      <PolarGrid stroke="rgba(255,255,255,0.06)" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fill: "#aaa", fontSize: 10 }} />
                      <PolarRadiusAxis domain={[0, 5]} tick={{ fill: "#555", fontSize: 9 }} />
                      <Radar name="Avg Score" dataKey="score" stroke="#ffe600" fill="#ffe600" fillOpacity={0.15} strokeWidth={2} />
                      <Tooltip
                        contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                  {/* Dimension list summary */}
                  <div className="space-y-2 min-w-[220px]">
                    {avgDimData
                      .sort((a, b) => b.score - a.score)
                      .map((d) => (
                        <div key={d.dimension} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-muted-foreground truncate">{d.dimension}</div>
                            <div className="mt-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(d.score / 5) * 100}%`,
                                  backgroundColor: d.score >= 4 ? "#10b981" : d.score >= 2.5 ? "#ffe600" : "#ef4444",
                                }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-foreground w-8 text-right">{d.score}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Benchmarks Toggle */}
            <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">Dynamic Benchmarks</div>
                    <div className="text-xs text-muted-foreground">
                      When enabled, benchmarks are computed from real survey data (requires ≥30 responses per role). Otherwise, static values are used.
                    </div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const headers = await getHeaders();
                      const res = await fetch(`${API_BASE}/api/admin/settings/benchmarks`, { headers });
                      const current = res.ok ? await res.json() : { dynamic_enabled: false };
                      const next = !current.dynamic_enabled;
                      await fetch(`${API_BASE}/api/admin/settings/benchmarks`, {
                        method: "PUT",
                        headers,
                        body: JSON.stringify({ dynamic_enabled: next }),
                      });
                      setDynamicBenchmarks(next);
                      toast.success(`Dynamic benchmarks ${next ? "enabled" : "disabled"}`);
                    } catch {
                      toast.error("Failed to update setting");
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    dynamicBenchmarks ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      dynamicBenchmarks ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* SURVEYS TAB                            */}
        {/* ═══════════════════════════════════════ */}
        {tab === "surveys" && (
          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user, persona, role, stage…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-10 bg-card/50 border-border/40 text-foreground rounded-xl focus:border-primary/50"
                />
              </div>
              <span className="text-xs text-muted-foreground bg-card/30 border border-border/30 rounded-lg px-3 py-2">
                {filteredSurveys.length} of {surveys.length}
              </span>
            </div>

            {/* Survey cards/table */}
            <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-3">Participant</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-3">Persona</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-3">Role</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-3">Score</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-3">Stage</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-3">Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-3 w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSurveys.map((s) => {
                    const user = userMap.get(s.uid);
                    const stage = getStageLabel(s.scores.composite_score);
                    const isExpanded = expandedRow === s.id;
                    return (
                      <>
                        <TableRow
                          key={s.id}
                          className={`border-border/20 cursor-pointer transition-colors ${isExpanded ? "bg-white/[0.02]" : "hover:bg-white/[0.015]"}`}
                          onClick={() => setExpandedRow(isExpanded ? null : s.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-primary">
                                  {(user?.name || s.uid)?.[0]?.toUpperCase() || "?"}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-foreground truncate">
                                  {user?.name || s.uid.slice(0, 10) + "…"}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">{user?.email || "—"}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground">{s.persona}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.role}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-primary">{s.scores.composite_score}</span>
                              <div className="w-12 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${(s.scores.composite_score / 5) * 100}%` }} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-lg border ${getStageBadgeColor(stage)}`}>
                              {stage}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {new Date(s.submitted_at).toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={`h-6 w-6 rounded-md flex items-center justify-center transition-all ${isExpanded ? "bg-primary/10 rotate-180" : "hover:bg-white/[0.05]"}`}>
                              <ChevronDown className={`h-4 w-4 ${isExpanded ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow key={`${s.id}-detail`} className="border-border/10">
                            <TableCell colSpan={7} className="p-0">
                              <div className="bg-gradient-to-b from-white/[0.02] to-transparent border-t border-primary/10 p-6 animate-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  {/* Radar chart */}
                                  <div className="rounded-xl border border-border/30 bg-white/[0.01] p-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                                      <Activity className="h-3 w-3 text-primary" /> Dimension Radar
                                    </h4>
                                    <ResponsiveContainer width="100%" height={230}>
                                      <RadarChart
                                        data={s.scores.dimensions.map((d) => ({
                                          dimension: d.dimension_name,
                                          score: d.score,
                                          fullMark: 5,
                                        }))}
                                      >
                                        <PolarGrid stroke="rgba(255,255,255,0.06)" />
                                        <PolarAngleAxis dataKey="dimension" tick={{ fill: "#aaa", fontSize: 9 }} />
                                        <PolarRadiusAxis domain={[0, 5]} tick={{ fill: "#555", fontSize: 8 }} />
                                        <Radar dataKey="score" stroke="#ffe600" fill="#ffe600" fillOpacity={0.15} strokeWidth={2} />
                                      </RadarChart>
                                    </ResponsiveContainer>
                                  </div>

                                  {/* Score breakdown */}
                                  <div className="rounded-xl border border-border/30 bg-white/[0.01] p-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                                      <BarChart3 className="h-3 w-3 text-primary" /> Score Breakdown
                                    </h4>
                                    <div className="space-y-3">
                                      {s.scores.dimensions.map((d) => (
                                        <div key={d.dimension_id} className="flex items-center gap-3">
                                          <span className="text-[11px] text-muted-foreground w-28 truncate shrink-0">{d.dimension_name}</span>
                                          <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                                            <div
                                              className="h-full rounded-full transition-all"
                                              style={{
                                                width: `${(d.score / 5) * 100}%`,
                                                backgroundColor: d.score >= 4 ? "#10b981" : d.score >= 2.5 ? "#ffe600" : "#ef4444",
                                              }}
                                            />
                                          </div>
                                          <span className="text-xs font-bold text-foreground w-7 text-right">{d.score}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* User details */}
                                  {user && (
                                    <div className="lg:col-span-2">
                                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                        <Users className="h-3 w-3 text-primary" /> Participant Profile
                                      </h4>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                          { label: "Company", value: user.company, icon: Building2 },
                                          { label: "GCC Location", value: user.gcc_location, icon: MapPin },
                                          { label: "GCC Size", value: user.gcc_size, icon: Users },
                                          { label: "Industry", value: user.parent_industry, icon: Briefcase },
                                        ].map((item) => (
                                          <div key={item.label} className="rounded-xl border border-border/30 bg-white/[0.015] p-3 flex items-start gap-2.5">
                                            <item.icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">{item.label}</div>
                                              <div className="text-sm font-medium text-foreground truncate">{item.value || "—"}</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Insights */}
                                  {s.insights && Object.keys(s.insights).length > 0 && (
                                    <div className="lg:col-span-2">
                                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                        <Eye className="h-3 w-3 text-primary" /> AI-Generated Insights
                                      </h4>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {s.scores.dimensions.map((d) => {
                                          const dimInsights = s.insights[String(d.dimension_id)];
                                          if (!dimInsights) return null;
                                          return (
                                            <div key={d.dimension_id} className="rounded-xl border border-border/30 bg-white/[0.015] p-3">
                                              <div className="flex items-center gap-2 mb-2">
                                                <div
                                                  className="h-1.5 w-1.5 rounded-full"
                                                  style={{ backgroundColor: d.score >= 4 ? "#10b981" : d.score >= 2.5 ? "#ffe600" : "#ef4444" }}
                                                />
                                                <span className="text-xs font-semibold text-foreground">{d.dimension_name}</span>
                                                <span className="text-[10px] text-muted-foreground ml-auto">{d.score}/5</span>
                                              </div>
                                              <ul className="space-y-1">
                                                {dimInsights.map((insight, i) => (
                                                  <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 leading-relaxed">
                                                    <span className="text-primary mt-0.5 shrink-0">•</span>
                                                    {insight}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Questions & Answers */}
                                  {s.answers && s.answers.length > 0 && (
                                    <div className="lg:col-span-2">
                                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                        <FileBarChart className="h-3 w-3 text-primary" /> Questions & Answers
                                      </h4>
                                      <div className="space-y-3">
                                        {s.answers.map((a, idx) => (
                                          <div key={a.dimension_id} className="rounded-xl border border-border/30 bg-white/[0.015] p-4">
                                            <div className="flex items-start gap-3 mb-3">
                                              <span className="shrink-0 h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                                {idx + 1}
                                              </span>
                                              <div className="min-w-0">
                                                <div className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-0.5">{a.dimension_name}</div>
                                                <div className="text-xs text-foreground leading-relaxed">{a.question}</div>
                                              </div>
                                            </div>
                                            {a.all_options ? (
                                              <div className="space-y-1.5 ml-9">
                                                {a.all_options.map((opt) => {
                                                  const isSelected = opt.value === a.selected_option;
                                                  const isBest = opt.value === 5;
                                                  return (
                                                    <div
                                                      key={opt.value}
                                                      className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-[11px] transition-colors ${
                                                        isSelected
                                                          ? "bg-primary/10 border border-primary/20"
                                                          : isBest
                                                          ? "bg-emerald-500/5 border border-emerald-500/10"
                                                          : "bg-white/[0.02] border border-transparent"
                                                      }`}
                                                    >
                                                      <span className={`shrink-0 mt-0.5 font-bold ${isSelected ? "text-primary" : isBest ? "text-emerald-400" : "text-muted-foreground/50"}`}>
                                                        {isSelected && isBest ? "✓" : isSelected ? "●" : isBest ? "★" : `${opt.value}.`}
                                                      </span>
                                                      <div className="min-w-0">
                                                        <span className={`font-semibold ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                                                          {opt.label}
                                                        </span>
                                                        <span className={`ml-1.5 ${isSelected ? "text-foreground/70" : "text-muted-foreground/60"}`}>
                                                          — {opt.description}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                                <div className="text-[9px] text-muted-foreground/50 mt-1 ml-1">
                                                  <span className="text-primary">● Selected</span>
                                                  <span className="mx-2">·</span>
                                                  <span className="text-emerald-400">★ Highest maturity</span>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="ml-9 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                                                <span className="text-[11px] text-foreground">
                                                  <span className="font-semibold text-primary">Score {a.selected_option}/5:</span>{" "}
                                                  {a.option_label} — {a.option_description}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Roadmap */}
                                  {(() => {
                                    const userRoadmap = roadmaps.find((r) => r.uid === s.uid);
                                    if (!userRoadmap) return null;
                                    const rm = userRoadmap.roadmap;
                                    return (
                                      <div className="lg:col-span-2">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                          <Compass className="h-3 w-3 text-primary" /> AI Transformation Roadmap
                                        </h4>

                                        {/* Target banner */}
                                        <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 mb-4 flex items-center gap-5">
                                          <div className="text-center shrink-0">
                                            <div className="text-2xl font-extrabold text-primary">{rm.target_score.toFixed(1)}</div>
                                            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Target</div>
                                          </div>
                                          <div className="h-10 w-px bg-primary/20" />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-foreground mb-1">{rm.target_stage_name}</div>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{rm.projected_landing}</p>
                                          </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                          {rm.actions.map((action) => (
                                            <div key={action.number} className="rounded-xl border border-border/30 bg-white/[0.015] p-4">
                                              <div className="flex items-center gap-2 mb-2">
                                                <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center">
                                                  <span className="text-[10px] font-extrabold text-primary">{action.number}</span>
                                                </div>
                                                <span className="text-[9px] font-bold text-primary/60 uppercase tracking-wider">{action.timeline}</span>
                                              </div>
                                              <div className="text-xs font-bold text-foreground mb-1">{action.title}</div>
                                              <p className="text-[11px] text-muted-foreground leading-relaxed">{action.description}</p>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Journey timeline */}
                                        <div className="rounded-xl border border-border/30 bg-white/[0.015] p-5">
                                          <div className="text-xs font-bold text-foreground mb-4">6-Month Journey</div>
                                          <div className="relative pl-6">
                                            <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 to-primary/10" />
                                            {rm.journey.map((phase, idx) => (
                                              <div key={idx} className="relative mb-5 last:mb-0">
                                                <div className="absolute -left-4 top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/20" />
                                                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Month {phase.months}</div>
                                                <div className="text-xs font-bold text-primary mt-0.5 mb-1.5">{phase.phase_title}</div>
                                                <ul className="space-y-0.5">
                                                  {phase.milestones.map((m, i) => (
                                                    <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                                                      <span className="text-primary shrink-0">→</span> {m}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}

                  {filteredSurveys.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                        <div className="flex flex-col items-center gap-2">
                          <FileBarChart className="h-8 w-8 text-muted-foreground/30" />
                          {search ? "No surveys match your search." : "No surveys submitted yet."}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* USERS TAB                              */}
        {/* ═══════════════════════════════════════ */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((u) => {
                const userSurveys = surveys.filter((s) => s.uid === u.uid);
                const latestSurvey = userSurveys[0];
                const stage = latestSurvey ? getStageLabel(latestSurvey.scores.composite_score) : null;
                return (
                  <div
                    key={u.uid}
                    className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-5 hover:border-primary/20 transition-all duration-200"
                  >
                    {/* User header */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">{u.name?.[0]?.toUpperCase() || "?"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-foreground truncate">{u.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                          <Mail className="h-3 w-3 shrink-0" /> {u.email}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-lg bg-primary/10 text-primary text-[11px] font-bold px-1.5">
                          {userSurveys.length}
                        </span>
                        <span className="text-[9px] text-muted-foreground">surveys</span>
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Company", value: u.company },
                        { label: "Location", value: u.gcc_location },
                        { label: "GCC Size", value: u.gcc_size },
                        { label: "Industry", value: u.parent_industry },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                          <div className="text-[8px] uppercase tracking-widest text-muted-foreground/60">{item.label}</div>
                          <div className="text-[11px] font-medium text-foreground truncate">{item.value || "—"}</div>
                        </div>
                      ))}
                    </div>

                    {/* Latest score */}
                    {latestSurvey && stage && (
                      <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Latest Score:</span>
                          <span className="text-sm font-bold text-primary">{latestSurvey.scores.composite_score}/5</span>
                        </div>
                        <span className={`inline-flex text-[9px] font-bold px-2 py-0.5 rounded-md border ${getStageBadgeColor(stage)}`}>
                          {stage}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {users.length === 0 && (
              <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm py-16 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <span className="text-sm text-muted-foreground">No users registered yet.</span>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* REPORTS TAB                            */}
        {/* ═══════════════════════════════════════ */}
        {tab === "reports" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Diagnostic Reports</span>
              </div>
              <span className="text-[10px] text-muted-foreground bg-card/30 border border-border/30 rounded-lg px-2.5 py-1">
                {reports.length} report{reports.length !== 1 ? "s" : ""}
              </span>
            </div>

            {reports.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {reports.map((r) => {
                  const stage = r.stage || getStageLabel(r.composite_score);
                  return (
                    <div key={r.id} className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-5 hover:border-primary/20 transition-all duration-200">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-purple-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-foreground truncate">{r.user_name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{r.user_email}</div>
                          </div>
                        </div>
                      </div>

                      {/* Info chips */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <span className="text-[10px] font-medium bg-white/[0.03] border border-border/30 rounded-md px-2 py-0.5 text-muted-foreground">
                          {r.persona}
                        </span>
                        <span className="text-[10px] font-medium bg-white/[0.03] border border-border/30 rounded-md px-2 py-0.5 text-muted-foreground">
                          {r.role}
                        </span>
                        <span className={`inline-flex text-[9px] font-bold px-2 py-0.5 rounded-md border ${getStageBadgeColor(stage)}`}>
                          {stage}
                        </span>
                      </div>

                      {/* Score + date row */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-extrabold text-primary">{r.composite_score}</span>
                          <span className="text-xs text-muted-foreground">/ 5.0</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(r.requested_at).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Download button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-9 rounded-xl border-primary/20 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
                        onClick={async () => {
                          try {
                            const hdrs = await getHeaders();
                            const res = await fetch(
                              `${API_BASE}/api/admin/reports/${r.id}/download`,
                              { headers: hdrs }
                            );
                            if (!res.ok) throw new Error("Download failed");
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `GARIX_Report_${r.user_name.replace(/ /g, "_")}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch {
                            toast.error("Failed to download report");
                          }
                        }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm py-16 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <span className="text-sm text-muted-foreground">No diagnostic reports requested yet.</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
