import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Loader2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

interface OptionItem {
  label: string;
  description: string;
}

interface DimensionQuestion {
  dimension_id: number;
  dimension_name: string;
  question: string;
  options: OptionItem[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

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
    setAnswers((prev) => ({ ...prev, [currentQuestion.dimension_id]: value }));
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
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
      const selected = answers[q.dimension_id];
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
      navigate("/results", { state: { scores: data.scores, insights: data.insights, persona, role, answers: answerItems } });
    } catch {
      toast.error("Failed to submit assessment. Please try again.");
      setSubmitting(false);
    }
  };

  const allAnswered = totalQuestions > 0 && Object.keys(answers).length === totalQuestions;
  const currentAnswer = currentQuestion ? answers[currentQuestion.dimension_id] : undefined;

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
    <div className="min-h-screen bg-mesh-gradient flex items-center justify-center p-6 relative overflow-hidden">
      <div className="orb orb-gold w-[350px] h-[350px] top-[5%] right-[-5%]" />
      <div className="orb orb-blue w-[300px] h-[300px] bottom-[-5%] left-[-5%]" />
      <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />

      <div className="w-full max-w-2xl relative z-10">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(progress)}% complete
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question number navigator */}
        <div className="flex flex-wrap gap-2 mb-6">
          {questions.map((q, i) => {
            const isActive = i === currentIndex;
            const isAnswered = answers[q.dimension_id] !== undefined;
            const isMarked = marked.has(q.dimension_id);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={`relative h-9 w-9 rounded-lg text-sm font-bold transition-all duration-200 border ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30 scale-110"
                    : isMarked
                    ? "bg-orange-500/15 text-orange-400 border-orange-500/40 hover:border-orange-400/60"
                    : isAnswered
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:border-emerald-400/50"
                    : "bg-card/40 text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
                }`}
                title={`Q${i + 1}: ${q.dimension_name}${isMarked ? " ⚑ marked" : isAnswered ? " ✓" : " (unanswered)"}`}
              >
                {i + 1}
                {isMarked && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-orange-400 border border-background" />
                )}
              </button>
            );
          })}
        </div>

        {/* Dimension badge */}
        {currentQuestion && (
          <div className="animate-fade-in" key={currentQuestion.dimension_id}>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 mb-4">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-xs font-medium text-primary">
                {currentQuestion.dimension_name}
              </span>
            </div>

            {/* Question card */}
            <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm p-8 mb-6">
              <h2 className="text-lg font-semibold text-foreground leading-relaxed mb-4">
                <span className="text-lg font-semibold text-foreground mr-1">Q{currentIndex + 1}.</span>
                {currentQuestion.question}
              </h2>
              <button
                type="button"
                onClick={toggleMark}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-200 ${
                  marked.has(currentQuestion.dimension_id)
                    ? "bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25"
                    : "bg-card/40 text-muted-foreground border-border/50 hover:text-foreground hover:border-primary/30"
                }`}
              >
                <Flag className="h-3 w-3" />
                {marked.has(currentQuestion.dimension_id) ? "Marked for review" : "Mark for review"}
              </button>
            </div>

            {/* Answer options */}
            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => {
                const value = idx + 1;
                const isSelected = currentAnswer === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSelect(value)}
                    className={`w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all duration-300 ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]"
                        : "border-border/50 bg-card/40 hover:border-primary/40 hover:bg-card/60"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {value}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    {isSelected && (
                      <div className="ml-auto h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex justify-between">
          <Button
            variant="outline"
            size="lg"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="group"
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
              className="min-w-[160px] shimmer group"
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
              className="min-w-[160px] shimmer group"
            >
              Submit
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Survey;