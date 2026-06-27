import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck,
  X,
  Upload,
  GitFork,
  BookOpen,
  Zap,
  Clock,
  ArrowRight,
  Check,
  Sparkles,
  FileText,
} from "lucide-react";

const SEEN_KEY = "keepsake.onboardingSeen";

type OnboardingCtx = { open: () => void };
const Ctx = createContext<OnboardingCtx>({ open: () => {} });

export function useOnboarding() {
  return useContext(Ctx);
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(true);

  // Trigger on first visit only.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setStep(0);
        setVisible(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const open = useCallback(() => {
    setStep(0);
    setVisible(true);
  }, []);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const close = useCallback(
    (persist: boolean) => {
      if (persist) markSeen();
      setVisible(false);
    },
    [markSeen],
  );

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <AnimatePresence>
        {visible && (
          <OnboardingModal
            step={step}
            setStep={setStep}
            dontShow={dontShow}
            setDontShow={setDontShow}
            onSkip={() => close(true)}
            onFinish={() => close(dontShow)}
          />
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

const STEPS = 4;

function OnboardingModal({
  step,
  setStep,
  dontShow,
  setDontShow,
  onSkip,
  onFinish,
}: {
  step: number;
  setStep: (n: number) => void;
  dontShow: boolean;
  setDontShow: (v: boolean) => void;
  onSkip: () => void;
  onFinish: () => void;
}) {
  const next = () => (step < STEPS - 1 ? setStep(step + 1) : onFinish());
  const back = () => step > 0 && setStep(step - 1);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <button
          onClick={onSkip}
          aria-label="Close onboarding"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="min-h-[420px] p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
            >
              {step === 0 && <StepWelcome />}
              {step === 1 && <StepHowItWorks />}
              {step === 2 && <StepStartHere onGo={() => onFinish()} />}
              {step === 3 && <StepOutputs />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-border bg-secondary/30 px-8 py-4">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {Array.from({ length: STEPS }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            {step === STEPS - 1 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => setDontShow(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                Don&apos;t show again
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 0 ? (
              <button onClick={onSkip} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                Skip onboarding
              </button>
            ) : (
              <button onClick={back} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                Back
              </button>
            )}
            <button
              onClick={next}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {step === STEPS - 1 ? "Get started" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StepWelcome() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/40">
        <ShieldCheck className="h-11 w-11 text-primary" />
      </div>
      <h2 className="font-display text-3xl font-extrabold tracking-tight">Welcome to Streamline</h2>
      <p className="mt-3 max-w-md text-base text-accent">When AI goes offline, your team stays online.</p>
      <p className="mt-4 max-w-md text-sm text-muted-foreground">
        Map every tool your business depends on — AI or not. Know exactly what breaks when one
        fails, and have a plan ready before it happens.
      </p>
    </div>
  );
}

function StepHowItWorks() {
  const tiles = [
    {
      icon: Upload,
      title: "Upload a workflow or code",
      desc: "Record an automation or paste its code / pseudocode.",
    },
    {
      icon: GitFork,
      title: "Get a map + fallback guides",
      desc: "We map AI dependencies and write human takeover guides.",
    },
    {
      icon: Zap,
      title: "Run drills + monitor decay",
      desc: "Practise outages and get alerted as knowledge ages.",
    },
  ];
  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold">How Streamline works</h2>
      <p className="mb-6 text-sm text-muted-foreground">A simple loop that keeps your operations resilient.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t, i) => (
          <div key={i} className="relative rounded-xl border border-border bg-secondary/40 p-4">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <t.icon className="h-5 w-5" />
            </span>
            <h3 className="text-sm font-bold">{t.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
            {i < tiles.length - 1 && (
              <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/50 sm:block" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        Uploading your automation code or pseudocode is the primary trigger — Streamline reads it to
        build your dependency map and guides automatically.
      </div>
    </div>
  );
}

function StepStartHere({ onGo }: { onGo: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-4 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
        Start here
      </span>
      <h2 className="font-display text-2xl font-bold">Your first step</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Record or upload an automation workflow. Everything else — maps, guides, drills — flows from
        that single input.
      </p>
      <Link
        to="/workflow-recorder"
        onClick={onGo}
        className="mt-7 inline-flex items-center gap-3 rounded-xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
      >
        <Upload className="h-5 w-5" />
        Record or upload an automation workflow
        <ArrowRight className="h-5 w-5" />
      </Link>
    </div>
  );
}

function StepOutputs() {
  const outputs = [
    { icon: GitFork, title: "Dependency Map", desc: "See where AI is a single point of failure." },
    { icon: BookOpen, title: "Fallback Guide", desc: "Step-by-step manual takeover instructions." },
    { icon: Clock, title: "Drill Report", desc: "Readiness scores from simulated outages." },
  ];
  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold">What you&apos;ll get</h2>
      <p className="mb-6 text-sm text-muted-foreground">Three outputs that keep your team prepared.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {outputs.map((o, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-secondary/40">
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-primary/15 to-accent/10">
              <o.icon className="h-9 w-9 text-primary" />
            </div>
            <div className="p-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold">
                <Check className="h-3.5 w-3.5 text-accent" />
                {o.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{o.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        You can reopen this walkthrough anytime via &quot;How this works&quot; in the top-right of any page.
      </div>
    </div>
  );
}
