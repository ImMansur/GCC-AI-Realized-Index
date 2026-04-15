import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Loader2, Flag, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

interface OptionItem {
  label: string;
  description: string;
}

interface ShuffledOption extends OptionItem {
  originalValue: number; // 1-5 maturity score
}

interface DimensionQuestion {
  dimension_id: number;
  dimension_name: string;
  question: string;
  options: OptionItem[];
}

/** Fisher-Yates shuffle (returns a new array) */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const Survey = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const persona = searchParams.get("persona") || "";
  const role = searchParams.get("role") || "";

  const [questions, setQuestions] = useState<DimensionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [shuffledOptionsMap, setShuffledOptionsMap] = useState<Record<number, ShuffledOption[]>>({});
  const [pendingAnswer, setPendingAnswer] = useState<number | undefined>(undefined);
  const [mobileExpandedDim, setMobileExpandedDim] = useState<string | null>(null);

  useEffect(() => {
    if (!persona || !role) {
      navigate("/designation");
      return;
    }

    const fetchQuestions = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona, role }),
        });
        if (!res.ok) throw new Error("Failed to generate questions");
        const data = await res.json();
        setQuestions(data.questions);
        // Build a shuffled options map for each question
        const sMap: Record<number, ShuffledOption[]> = {};
        for (const q of data.questions as DimensionQuestion[]) {
          sMap[q.dimension_id] = shuffleArray(
            q.options.map((o, idx) => ({ ...o, originalValue: idx + 1 }))
          );
        }
        setShuffledOptionsMap(sMap);
      } catch {
        toast.error("Failed to load questions. Please try again.");
        navigate("/designation");
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [persona, role, navigate]);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).length;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const handleSelect = (value: number) => {
    if (!currentQuestion) return;
    setPendingAnswer(value);
  };

  const commitPending = () => {
    if (currentQuestion && pendingAnswer !== undefined) {
      setAnswers((prev) => ({ ...prev, [currentQuestion.dimension_id]: pendingAnswer }));
    }
  };

  const handleNext = () => {
    commitPending();
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    commitPending();
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const toggleMark = () => {
    if (!currentQuestion) return;
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.dimension_id)) {
        next.delete(currentQuestion.dimension_id);
      } else {
        next.add(currentQuestion.dimension_id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    // Merge pending answer synchronously so it's available immediately
    const mergedAnswers = { ...answers };
    if (currentQuestion && pendingAnswer !== undefined) {
      mergedAnswers[currentQuestion.dimension_id] = pendingAnswer;
    }
    setAnswers(mergedAnswers);

    if (marked.size > 0) {
      const markedNums = questions
        .map((q, i) => (marked.has(q.dimension_id) ? i + 1 : null))
        .filter(Boolean);
      const proceed = confirm(
        `You have ${marked.size} marked question${marked.size > 1 ? "s" : ""} for review (Q${markedNums.join(", Q")}). Do you still want to submit?`
      );
      if (!proceed) return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error("You must be signed in to submit.");
      navigate("/login");
      return;
    }

    setSubmitting(true);

    const answerItems = questions.map((q) => {
      const selected = mergedAnswers[q.dimension_id];
      const option = q.options[selected - 1];
      return {
        dimension_id: q.dimension_id,
        dimension_name: q.dimension_name,
        question: q.question,
        selected_option: selected,
        option_label: option.label,
        option_description: option.description,
        all_options: q.options.map((o, idx) => ({
          value: idx + 1,
          label: o.label,
          description: o.description,
        })),
      };
    });

    try {
      const res = await fetch(`${API_BASE}/api/survey/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, persona, role, answers: answerItems }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      const data = await res.json();
      toast.success("Assessment submitted successfully!");
      navigate("/results", { state: { scores: data.scores, insights: data.insights, persona, role, answers: answerItems, roadmap: data.roadmap || null } });
    } catch {
      toast.error("Failed to submit assessment. Please try again.");
      setSubmitting(false);
    }
  };

  const allAnswered = totalQuestions > 0 && (() => {
    const merged = { ...answers };
    if (currentQuestion && pendingAnswer !== undefined) {
      merged[currentQuestion.dimension_id] = pendingAnswer;
    }
    return Object.keys(merged).length === totalQuestions;
  })();
  const currentAnswer = currentQuestion ? (pendingAnswer ?? answers[currentQuestion.dimension_id]) : undefined;

  // Sync pendingAnswer when navigating to a question
  useEffect(() => {
    if (currentQuestion) {
      setPendingAnswer(answers[currentQuestion.dimension_id]);
    }
  }, [currentIndex]);

  /** Group questions by dimension for sidebar nav */
  const dimensionGroups = useMemo(() => {
    const groups: { name: string; items: { q: DimensionQuestion; idx: number }[] }[] = [];
    questions.forEach((q, i) => {
      const last = groups[groups.length - 1];
      if (last && last.name === q.dimension_name) {
        last.items.push({ q, idx: i });
      } else {
        groups.push({ name: q.dimension_name, items: [{ q, idx: i }] });
      }
    });
    return groups;
  }, [questions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center relative overflow-hidden">
        <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
        <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">
            Generating your personalised assessment…
          </p>
          <p className="text-xs text-muted-foreground/60">
            Tailoring questions for {role} in {persona}
          </p>
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-mesh-gradient flex items-center justify-center relative overflow-hidden">
        <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
        <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
        <div className="flex flex-col items-center gap-6 relative z-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground mb-2">
              Processing your assessment…
            </p>
            <p className="text-sm text-muted-foreground">
              Generating your GARIX maturity profile
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh-gradient relative overflow-hidden flex">
      {/* Background effects */}
      <div className="orb orb-gold w-[400px] h-[400px] top-[-8%] right-[-5%]" />
      <div className="orb orb-gold w-[300px] h-[300px] top-[40%] right-[10%] opacity-40" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[10%] left-[-5%]" />
      <div className="orb orb-purple w-[250px] h-[250px] bottom-[-5%] right-[20%]" />
      <div className="absolute top-[15%] left-[40%] w-[600px] h-[600px] rounded-full bg-yellow-500/[0.04] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] rounded-full bg-amber-400/[0.03] blur-[100px] pointer-events-none" />
      <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />

      {/* ── Left sidebar ── */}
      <aside className="hidden lg:flex flex-col w-72 fixed left-0 top-0 bottom-0 z-20 bg-background/80 backdrop-blur-xl border-0 border-r border-border/20 rounded-none">
        {/* Header */}
        <div className="px-5 pt-6 pb-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
            Dimensions
          </h3>
        </div>

        {/* Dimension list */}
        <nav className="flex-1 overflow-y-auto px-2 pt-1">
          {dimensionGroups.map((group) => {
            const groupHasActive = group.items.some((item) => item.idx === currentIndex);
            const answeredInGroup = group.items.filter(({ q }) => answers[q.dimension_id] !== undefined).length;
            return (
              <div
                key={group.name}
                className={`rounded-lg px-3 py-2.5 mb-1 border-l-[3px] transition-all duration-200 ${
                  groupHasActive
                    ? "border-l-primary bg-primary/8 ey-border-glow"
                    : "border-l-transparent hover:bg-card/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => { commitPending(); setCurrentIndex(group.items[0].idx); }}
                  className="w-full text-left"
                >
                  <span className={`text-[13px] font-bold block ${
                    groupHasActive ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {group.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 block mt-0.5">
                    {answeredInGroup}/{group.items.length} answered
                  </span>
                </button>
                {/* Question number buttons */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {group.items.map(({ q, idx }) => {
                    const isActive = idx === currentIndex;
                    const isAnswered = answers[q.dimension_id] !== undefined;
                    const isMarked = marked.has(q.dimension_id);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => { commitPending(); setCurrentIndex(idx); }}
                        className={`h-7 w-7 rounded-md text-[11px] font-bold transition-all duration-200 ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                            : isMarked
                            ? "bg-orange-500/15 text-orange-400 border border-orange-400/40"
                            : isAnswered
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "bg-card/40 text-muted-foreground/40 border border-border/30 hover:text-muted-foreground hover:border-border/60"
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer progress */}
        <div className="px-5 py-4 border-t border-border/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Progress</span>
            <span className="text-[11px] font-bold text-primary">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-yellow-400 transition-all duration-500 ease-out shadow-sm shadow-primary/30"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/20">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">Q{currentIndex + 1}/{totalQuestions}</span>
          <div className="flex-1 mx-3 h-1.5 rounded-full bg-muted/15 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-yellow-400 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] font-bold text-primary">{Math.round(progress)}%</span>
        </div>
        <div className="px-3 pb-2 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {dimensionGroups.map((group) => {
              const groupHasActive = group.items.some((item) => item.idx === currentIndex);
              return (
                <button
                  key={group.name}
                  type="button"
                  onClick={() => {
                    commitPending();
                    setCurrentIndex(group.items[0].idx);
                  }}
                  className={`shrink-0 text-[10px] font-semibold px-3 py-1 rounded-full border transition-all duration-200 ${
                    groupHasActive
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                      : "text-muted-foreground border-border/30 hover:text-foreground hover:border-border/60"
                  }`}
                >
                  {group.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col pt-[88px] lg:pt-0 lg:ml-72 relative z-10 min-w-0 overflow-hidden" style={{ zoom: 0.9, height: 'calc(100vh / 0.9)' }}>
        {/* Top bar: breadcrumb + progress (desktop only, mobile has fixed bar) */}
        <div className="hidden lg:block px-6 xl:px-10 pt-5 pb-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground/60">Assessment</span>
              <span className="text-muted-foreground/30">/</span>
              <span className="font-semibold text-primary">{currentQuestion?.dimension_name}</span>
              <span className="text-muted-foreground/30">/</span>
              <span className="text-muted-foreground">Q{currentIndex + 1} of {totalQuestions}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">{Math.round(progress)}%</span>
              <span className="text-xs text-muted-foreground/50">complete</span>
            </div>
          </div>
          <div className="h-[2px] mt-3 rounded-full bg-muted/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-yellow-400 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question area */}
        <div className="flex-1 px-4 sm:px-6 xl:px-10 py-6 lg:py-8 overflow-y-auto min-h-0 flex justify-center">
          <div className="max-w-2xl w-full">
            {currentQuestion && (
              <div className="animate-fade-in" key={currentQuestion.dimension_id}>
                {/* Dimension pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 backdrop-blur-sm px-3.5 py-1.5 mb-4 shadow-sm shadow-primary/10">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-semibold text-primary tracking-wide">
                    {currentQuestion.dimension_name}
                  </span>
                </div>

                {/* Question number buttons for current dimension */}
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {dimensionGroups
                    .find((g) => g.name === currentQuestion.dimension_name)
                    ?.items.map(({ q, idx }) => {
                      const isActive = idx === currentIndex;
                      const isAnswered = answers[q.dimension_id] !== undefined;
                      const isMarked = marked.has(q.dimension_id);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            commitPending();
                            setCurrentIndex(idx);
                          }}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition-all duration-200 ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                              : isMarked
                              ? "bg-orange-500/15 text-orange-400 border border-orange-400/40"
                              : isAnswered
                              ? "bg-primary/15 text-primary border border-primary/30"
                              : "bg-card/40 text-muted-foreground/50 border border-border/30 hover:text-muted-foreground hover:border-border/60"
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                </div>

                {/* Question + mark button */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6 lg:mb-8">
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground leading-snug">
                    <span className="text-primary/40 font-semibold mr-1.5">Q{currentIndex + 1}.</span>
                    {currentQuestion.question}
                  </h2>
                  <button
                    type="button"
                    onClick={toggleMark}
                    className={`self-start shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                      marked.has(currentQuestion.dimension_id)
                        ? "bg-orange-500/10 text-orange-400 border-orange-500/30 shadow-sm shadow-orange-500/10"
                        : "text-muted-foreground border-border/30 hover:text-foreground hover:border-border/60 hover:bg-card/40"
                    }`}
                  >
                    <Flag className="h-3 w-3" />
                    {marked.has(currentQuestion.dimension_id) ? "Marked" : "Mark for review"}
                  </button>
                </div>

                {/* Options */}
                <div className="space-y-3 stagger-children">
                  {(shuffledOptionsMap[currentQuestion.dimension_id] ?? []).map((option, idx) => {
                    const isSelected = currentAnswer === option.originalValue;
                    return (
                      <button
                        key={option.originalValue}
                        type="button"
                        onClick={() => handleSelect(option.originalValue)}
                        className={`w-full flex items-center gap-3 sm:gap-4 rounded-xl border p-3 sm:p-4 text-left transition-all duration-300 group/opt ${
                          isSelected
                            ? "border-primary/50 bg-primary/8 ey-border-glow"
                            : "border-border/20 bg-card/30 backdrop-blur-sm hover:border-border/40 hover:bg-card/50 hover:translate-y-[-1px]"
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all duration-300 ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                              : "bg-muted/20 text-muted-foreground group-hover/opt:bg-muted/30"
                          }`}
                        >
                          {String.fromCharCode(65 + idx)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold transition-colors ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {option.label}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">{option.description}</p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0 animate-fade-in" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="mt-auto border-t border-border/20 backdrop-blur-sm bg-background/30 px-4 sm:px-6 xl:px-10 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0">
          <Button
            variant="outline"
            size="lg"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="group border-border/30 hover:border-border/60 hover:bg-card/40"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Previous
          </Button>

          {currentIndex < totalQuestions - 1 ? (
            <Button
              variant="ey"
              size="lg"
              onClick={handleNext}
              disabled={currentAnswer === undefined}
              className="min-w-[130px] group shimmer shadow-lg shadow-primary/20"
            >
              Next
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          ) : (
            <Button
              variant="ey"
              size="lg"
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="min-w-[130px] group shimmer shadow-lg shadow-primary/20"
            >
              Submit
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

export default Survey;