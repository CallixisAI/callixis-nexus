import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { CheckCircle2, Lock, Gift, Sparkles } from "lucide-react";
import { toast } from "sonner";

const CASHBACK_TIERS = [
  { minDeposits: 1, maxDeposits: 4, rate: 0.03, label: "3%" },
  { minDeposits: 5, maxDeposits: 8, rate: 0.05, label: "5%" },
  { minDeposits: 9, maxDeposits: 12, rate: 0.08, label: "8%" },
  { minDeposits: 13, maxDeposits: 16, rate: 0.10, label: "10%" },
  { minDeposits: 17, maxDeposits: 20, rate: 0.15, label: "15%" },
];

const MAX_DEPOSITS = 20;
const MIN_TO_BREAK = 5;

const getCurrentTier = (count: number) =>
  CASHBACK_TIERS.find((t) => count >= t.minDeposits && count <= t.maxDeposits) ?? CASHBACK_TIERS[0];

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const COIN_EMOJIS = ["🪙", "💰", "✨", "⭐"];
const BURST_POSITIONS = [
  { x: "-30px", y: "-40px" },
  { x: "30px", y: "-35px" },
  { x: "-20px", y: "-50px" },
  { x: "25px", y: "-45px" },
  { x: "0px", y: "-55px" },
  { x: "-35px", y: "-25px" },
  { x: "35px", y: "-20px" },
  { x: "10px", y: "-60px" },
];

interface PiggyBankProps {
  depositAmounts: number[];
}

const PiggyBank = ({ depositAmounts }: PiggyBankProps) => {
  const [breakOpen, setBreakOpen] = useState(false);
  const [isBroken, setIsBroken] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isBreaking, setIsBreaking] = useState(false);
  const [showCoins, setShowCoins] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [coinDropKey, setCoinDropKey] = useState(0);

  const capped = depositAmounts.slice(0, MAX_DEPOSITS);
  const depositCount = capped.length;
  const canBreak = depositCount >= MIN_TO_BREAK && !isBroken;

  let accumulated = 0;
  capped.forEach((amt, i) => {
    const tier = getCurrentTier(i + 1);
    accumulated += amt * tier.rate;
  });

  const currentTier = getCurrentTier(depositCount);
  const progress = Math.min((depositCount / MAX_DEPOSITS) * 100, 100);
  const depositsUntilBreak = Math.max(MIN_TO_BREAK - depositCount, 0);

  // Coin drop animation on mount
  useEffect(() => {
    if (depositCount > 0) {
      setCoinDropKey((k) => k + 1);
    }
  }, [depositCount]);

  // Periodic shake when ready to break
  useEffect(() => {
    if (!canBreak || isBroken) return;
    const interval = setInterval(() => {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
    }, 4000);
    return () => clearInterval(interval);
  }, [canBreak, isBroken]);

  const handleBreak = useCallback(() => {
    setBreakOpen(false);
    setIsBreaking(true);
    setShowCoins(true);

    setTimeout(() => {
      setShowConfetti(true);
    }, 400);

    setTimeout(() => {
      setIsBroken(true);
      setIsBreaking(false);
      setShowCoins(false);
      setShowConfetti(false);
      toast.success(`🎉 Piggy broken! ${formatCurrency(accumulated)} cashback added to your balance!`);
    }, 1200);
  }, [accumulated]);

  return (
    <>
      <Card className="bg-card border-border overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-amber-500/5 pointer-events-none" />

        <CardContent className="p-5 relative">
          <div className="flex items-start gap-4">
            {/* Piggy icon with animations */}
            <div className="relative">
              <div
                className={`h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                  isBroken
                    ? "bg-emerald-500/10"
                    : canBreak
                    ? "bg-primary/10"
                    : "bg-secondary"
                } ${isShaking ? "animate-piggy-shake" : ""} ${isBreaking ? "animate-shatter" : ""}`}
              >
                <span className="text-3xl">
                  {isBreaking ? "💥" : isBroken ? "🎉" : "🐷"}
                </span>
              </div>

              {/* Coin drop animation */}
              {!isBroken && !isBreaking && depositCount > 0 && (
                <div key={coinDropKey} className="absolute -top-2 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className="inline-block animate-coin-drop text-lg">🪙</span>
                </div>
              )}

              {/* Coin burst on break */}
              {showCoins && (
                <div className="absolute inset-0 pointer-events-none">
                  {BURST_POSITIONS.map((pos, i) => (
                    <span
                      key={i}
                      className="absolute left-1/2 top-1/2 animate-coin-burst text-sm"
                      style={{
                        "--burst-x": pos.x,
                        "--burst-y": pos.y,
                        animationDelay: `${i * 0.06}s`,
                      } as React.CSSProperties}
                    >
                      {COIN_EMOJIS[i % COIN_EMOJIS.length]}
                    </span>
                  ))}
                </div>
              )}

              {/* Confetti on break */}
              {showConfetti && (
                <div className="absolute -top-4 -left-4 -right-4 pointer-events-none">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span
                      key={i}
                      className="absolute animate-confetti-fall text-xs"
                      style={{
                        left: `${Math.random() * 80}px`,
                        animationDelay: `${i * 0.08}s`,
                        color: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"][i % 5],
                      }}
                    >
                      {["🪙", "⭐", "✨", "💎", "🎊"][i % 5]}
                    </span>
                  ))}
                </div>
              )}

              {canBreak && !isBroken && !isBreaking && (
                <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <Sparkles className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    Cashback Piggy
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      {currentTier.label} rate
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isBroken
                      ? "Piggy broken! Cashback claimed."
                      : canBreak
                      ? "Ready to break! Claim your cashback."
                      : `${depositsUntilBreak} more deposit${depositsUntilBreak !== 1 ? "s" : ""} to unlock`}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className={`text-lg font-bold font-mono text-primary transition-all ${isBreaking ? "animate-count-up" : ""}`}>
                    {isBroken ? formatCurrency(0) : formatCurrency(accumulated)}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saved</p>
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{depositCount}/{MAX_DEPOSITS} deposits</span>
                  <span>Max 15% at 17+ deposits</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Tier ladder */}
              <div className="flex gap-1">
                {CASHBACK_TIERS.map((tier) => {
                  const isActive = depositCount >= tier.minDeposits;
                  const isCurrent = depositCount >= tier.minDeposits && depositCount <= tier.maxDeposits;
                  return (
                    <div
                      key={tier.label}
                      className={`flex-1 rounded-md px-1.5 py-1 text-center text-[10px] font-medium transition-colors ${
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : isActive
                          ? "bg-primary/20 text-primary"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {tier.label}
                      <div className="text-[8px] opacity-70">{tier.minDeposits}-{tier.maxDeposits}</div>
                    </div>
                  );
                })}
              </div>

              {/* Action */}
              {!isBroken && !isBreaking && (
                <Button
                  size="sm"
                  onClick={() => setBreakOpen(true)}
                  disabled={!canBreak}
                  className="w-full gap-2"
                  variant={canBreak ? "default" : "outline"}
                >
                  {canBreak ? (
                    <>
                      <Gift className="h-4 w-4" /> Break the Piggy — Claim {formatCurrency(accumulated)}
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> Locked — {depositsUntilBreak} deposits remaining
                    </>
                  )}
                </Button>
              )}

              {isBreaking && (
                <div className="flex items-center justify-center gap-2 text-xs text-primary py-2">
                  <span className="animate-pulse-glow">Breaking the piggy...</span>
                </div>
              )}

              {isBroken && !isBreaking && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 animate-fade-in-up">
                  <CheckCircle2 className="h-4 w-4" />
                  {formatCurrency(accumulated)} was added to your balance
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={breakOpen} onOpenChange={setBreakOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <span className="text-2xl">🐷</span> Break Your Piggy?
            </DialogTitle>
            <DialogDescription>
              You've accumulated <strong className="text-primary">{formatCurrency(accumulated)}</strong> in
              cashback from {depositCount} deposits. Breaking the piggy will add this amount to your available
              balance.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total deposits</span>
              <span className="text-foreground">{depositCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current tier</span>
              <span className="text-primary font-medium">{currentTier.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cashback earned</span>
              <span className="text-emerald-400 font-medium">{formatCurrency(accumulated)}</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">Keep Saving</Button>
            </DialogClose>
            <Button onClick={handleBreak} className="gap-2">
              <Gift className="h-4 w-4" /> Break & Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PiggyBank;
