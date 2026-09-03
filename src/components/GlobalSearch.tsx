import { useState, useEffect, useRef } from "react";
import { Search, X, Bot, Megaphone, Phone, Calendar, DollarSign, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type SearchResult = {
  type: "agent" | "campaign" | "call" | "event" | "lead" | "finance";
  title: string;
  subtitle: string;
  url: string;
};

// Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §D — "Hide
// or wire up the fake global search") — D.5's fix. This used to be ten fabricated
// customer-shaped records ("Call #1842 – Sarah Johnson", a fake $5,000 deposit, ...), rendered
// on every page including /admin, that looked like real production data but were never wired
// to anything. Real cross-table search (agents/campaigns/calls/leads, RLS-respecting) is a
// feature build in its own right, not "hardening" — out of scope here. The cheap, honest fix:
// hide the fake results rather than build the real feature under this phase's budget. The ⌘K
// entry point stays (so it's a small change to wire up real search later, per the empty-state
// message below), it just no longer lies about having anything to show.
const MOCK_RESULTS: SearchResult[] = [];

const iconMap: Record<string, typeof Bot> = {
  agent: Bot,
  campaign: Megaphone,
  call: Phone,
  event: Calendar,
  finance: DollarSign,
  lead: Users,
};

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const filtered = query.trim()
    ? MOCK_RESULTS.filter((r) =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : MOCK_RESULTS.slice(0, 5);

  const handleSelect = (result: SearchResult) => {
    navigate(result.url);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary border border-border text-sm text-muted-foreground hover:border-primary/50 transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Search...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-lg p-0 gap-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents, campaigns, calls, leads..."
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 h-8 p-0"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto py-2">
            {filtered.length === 0 ? (
              // D.5 — honest now that MOCK_RESULTS is empty: this used to render fabricated
              // results for ANY query, which read as real search. It never was.
              <p className="text-center text-sm text-muted-foreground py-8 px-6">
                Search isn't wired up to real data yet — try the sidebar instead.
              </p>
            ) : (
              filtered.map((result, i) => {
                const Icon = iconMap[result.type] || Bot;
                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{result.type}</span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
