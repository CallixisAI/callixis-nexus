import { useMemo, useState } from "react";
import {
  DollarSign,
  Wallet,
  ArrowUpRight,
  RotateCcw,
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Phone,
  TrendingUp,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import PiggyBank from "@/components/finance/PiggyBank";
import { useCampaigns } from "@/hooks/useCampaigns";

type TxStatus = "completed" | "pending" | "failed";
type TxType = "budget" | "revenue" | "lead";

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  status: TxStatus;
  description: string;
  date: string;
  reference: string;
}

const statusConfig: Record<TxStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  completed: { icon: CheckCircle2, label: "Completed", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  pending: { icon: Clock, label: "Pending", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  failed: { icon: XCircle, label: "At Risk", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const typeLabels: Record<TxType, { label: string; color: string }> = {
  budget: { label: "Budget", color: "text-amber-400" },
  revenue: { label: "Revenue", color: "text-emerald-400" },
  lead: { label: "Qualified Lead", color: "text-primary" },
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));

const formatDate = (value?: string) => {
  if (!value) return "Just now";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const BalanceCards = ({ balance, pending, earned }: { balance: number; pending: number; earned: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {[
      { title: "Available Revenue", value: balance, icon: Wallet, accent: "text-primary" },
      { title: "Budget Committed", value: pending, icon: Clock, accent: "text-amber-400" },
      { title: "Pipeline Value", value: earned, icon: TrendingUp, accent: "text-emerald-400" },
    ].map((card) => (
      <Card key={card.title} className="bg-card border-border">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center">
            <card.icon className={`h-6 w-6 ${card.accent}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{card.title}</p>
            <p className={`text-2xl font-bold font-display ${card.accent}`}>{formatCurrency(card.value)}</p>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const ActionDialog = ({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel: string;
}) => {
  const [amount, setAmount] = useState("");

  const handleAction = () => {
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    toast.success(`${actionLabel} request captured. This action still needs a real payment provider to move money.`);
    setAmount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          <Label className="text-foreground">Amount (USD)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 bg-secondary border-border" placeholder="0.00" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 mt-4">
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleAction}>{actionLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const TransactionRow = ({ tx }: { tx: Transaction }) => {
  const [expanded, setExpanded] = useState(false);
  const status = statusConfig[tx.status];
  const StatusIcon = status.icon;
  const type = typeLabels[tx.type];
  const isPositive = tx.amount >= 0;

  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors text-left">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isPositive ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
          {isPositive ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : <CreditCard className="h-4 w-4 text-amber-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{tx.description}</p>
          <p className="text-xs text-muted-foreground">{tx.date} · <span className={type.color}>{type.label}</span></p>
        </div>
        <p className={`text-sm font-semibold font-mono ${isPositive ? "text-emerald-400" : "text-amber-400"}`}>
          {isPositive ? "+" : "-"}{formatCurrency(tx.amount)}
        </p>
        <Badge variant="outline" className={`text-xs ${status.className}`}>
          <StatusIcon className="h-3 w-3 mr-1" />{status.label}
        </Badge>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 pl-16 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-muted-foreground">Reference</span><p className="text-foreground font-mono">{tx.reference}</p></div>
          <div><span className="text-muted-foreground">Category</span><p className="text-foreground">{type.label}</p></div>
          <div><span className="text-muted-foreground">Status</span><p className={type.color}>{status.label}</p></div>
          <div><span className="text-muted-foreground">Source</span><p className="text-foreground">Live campaign data</p></div>
        </div>
      )}
    </div>
  );
};

const Finance = () => {
  const { campaigns = [], isLoading } = useCampaigns();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [txFilter, setTxFilter] = useState<"all" | TxType>("all");

  const transactions = useMemo(() => {
    const items: Transaction[] = [];

    campaigns.forEach((campaign) => {
      if (campaign.budget > 0) {
        items.push({
          id: `${campaign.id}-budget`,
          type: "budget",
          amount: -campaign.budget,
          status: campaign.status === "Paused" ? "pending" : "completed",
          description: `${campaign.name} budget allocation`,
          date: campaign.records[0]?.callDate || "",
          reference: `BUD-${campaign.id.slice(0, 8).toUpperCase()}`,
        });
      }

      const revenue = campaign.records.reduce((sum, record) => sum + (record.status === "completed" ? 250 : 0), 0);
      if (revenue > 0) {
        items.push({
          id: `${campaign.id}-revenue`,
          type: "revenue",
          amount: revenue,
          status: "completed",
          description: `${campaign.name} converted revenue`,
          date: campaign.records.find((record) => record.status === "completed")?.callDate || "",
          reference: `REV-${campaign.id.slice(0, 8).toUpperCase()}`,
        });
      }

      if (campaign.qualifiedLeadsSent > 0) {
        items.push({
          id: `${campaign.id}-leads`,
          type: "lead",
          amount: campaign.qualifiedLeadsSent * 75,
          status: campaign.status === "Completed" ? "completed" : "pending",
          description: `${campaign.qualifiedLeadsSent} qualified leads from ${campaign.name}`,
          date: campaign.records[0]?.callDate || "",
          reference: `LEAD-${campaign.id.slice(0, 8).toUpperCase()}`,
        });
      }
    });

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [campaigns]);

  const filtered = txFilter === "all" ? transactions : transactions.filter((transaction) => transaction.type === txFilter);
  const completedDepositAmounts = transactions.filter((transaction) => transaction.type === "revenue" && transaction.status === "completed").map((transaction) => Math.abs(transaction.amount));
  const totalRevenue = transactions.filter((transaction) => transaction.type === "revenue").reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const totalBudget = transactions.filter((transaction) => transaction.type === "budget").reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const pipelineValue = transactions.filter((transaction) => transaction.type === "lead").reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const totalCalls = campaigns.reduce((sum, campaign) => sum + campaign.calls, 0);
  const totalQualifiedLeads = campaigns.reduce((sum, campaign) => sum + campaign.qualifiedLeadsSent, 0);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading finance data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-foreground">Finance</h1>
          <p className="text-sm text-muted-foreground mt-1">Commercial view of budgets, lead value, and campaign revenue</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setDepositOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Budget</Button>
          <Button onClick={() => setWithdrawOpen(true)} variant="outline" className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"><ArrowUpRight className="h-4 w-4" /> Withdraw</Button>
          <Button onClick={() => setRefundOpen(true)} variant="outline" className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"><RotateCcw className="h-4 w-4" /> Refund</Button>
        </div>
      </div>

      <BalanceCards balance={totalRevenue} pending={totalBudget} earned={pipelineValue} />

      <PiggyBank depositAmounts={completedDepositAmounts} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Phone className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Calls Processed</p>
              <p className="text-xl font-bold text-foreground">{totalCalls.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Target className="h-5 w-5 text-emerald-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Qualified Leads</p>
              <p className="text-xl font-bold text-foreground">{totalQualifiedLeads.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-amber-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Revenue Per Lead</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(totalQualifiedLeads > 0 ? totalRevenue / totalQualifiedLeads : 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">What is real on this page right now</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                This page now derives its numbers from your real campaigns and call records. Budgets come from campaign settings, qualified lead value is inferred from stored lead outcomes, and revenue is estimated from completed calls. Money movement actions are still placeholders until a payment provider such as Stripe is wired in.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-foreground">Commercial Activity</CardTitle>
              <CardDescription>Generated from live campaign data</CardDescription>
            </div>
            <Select value={txFilter} onValueChange={(value) => setTxFilter(value as typeof txFilter)}>
              <SelectTrigger className="w-[180px] bg-secondary border-border">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activity</SelectItem>
                <SelectItem value="budget">Budgets</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="lead">Qualified Leads</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No financial activity yet. Create campaigns and import leads first.</div>
          ) : (
            filtered.map((transaction) => <TransactionRow key={transaction.id} tx={transaction} />)
          )}
        </CardContent>
      </Card>

      <ActionDialog open={depositOpen} onOpenChange={setDepositOpen} title="Add Budget" description="Record new budget funding for the platform. This currently logs intent only." actionLabel="Add Budget" />
      <ActionDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} title="Withdraw Funds" description="Request payout from generated revenue. This still needs a real payout provider." actionLabel="Request Withdrawal" />
      <ActionDialog open={refundOpen} onOpenChange={setRefundOpen} title="Request Refund" description="Capture a refund request for follow-up. Payment rails are not connected yet." actionLabel="Submit Refund" />
    </div>
  );
};

export default Finance;
