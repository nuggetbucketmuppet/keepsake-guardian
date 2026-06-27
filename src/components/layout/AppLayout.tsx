import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Home,
  Activity,
  ListChecks,
  BookOpen,
  GitFork,
  Zap,
  Settings,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  HelpCircle,
  Gauge,
} from "lucide-react";
import { OnboardingProvider, useOnboarding } from "@/components/Onboarding";
import { ACCOUNT, useOrg } from "@/lib/store";
import logo from "@/assets/keepsake-logo.png";
import profilePhoto from "@/assets/profile-photo.png.asset.json";

function HowThisWorksButton() {
  const { open } = useOnboarding();
  return (
    <button
      onClick={open}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-secondary hover:text-foreground"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden sm:inline">How this works</span>
    </button>
  );
}

const NAV = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/workflow-recorder", label: "Upload a Workflow", icon: Activity },
  { to: "/manage-workflows", label: "Manage Workflows", icon: ListChecks },
  { to: "/evaluate-workflows", label: "Evaluate Workflows", icon: Gauge },
  { to: "/dependency-map", label: "Dependency Map", icon: GitFork },
  { to: "/fallback-guides", label: "Fallback Guides", icon: BookOpen },
  { to: "/failure-drills", label: "Failure Drills", icon: Zap },
  { to: "/policy-centre", label: "Policy Compliance", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </OnboardingProvider>
  );
}

function AppLayoutInner({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const org = useOrg();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-sidebar transition-transform duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
            <img src={logo} alt="Streamline logo" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <div className="font-display text-lg font-extrabold leading-none tracking-tight">Streamline</div>
          </div>

        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? "text-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <img src={profilePhoto.url} alt={ACCOUNT.name} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-accent/40" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{org}</div>
              <div className="truncate text-xs text-muted-foreground">{ACCOUNT.email}</div>
            </div>
            <button
              aria-label="Log out"
              onClick={() => toast.success("You have been signed out.")}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop on mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="font-display font-bold">Streamline</span>
          <div className="ml-auto">
            <HowThisWorksButton />
          </div>
        </header>
        {/* Floating help button on desktop */}
        <div className="pointer-events-none fixed right-5 top-4 z-30 hidden lg:block">
          <div className="pointer-events-auto">
            <HowThisWorksButton />
          </div>
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
