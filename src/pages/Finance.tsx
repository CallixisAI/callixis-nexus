import { useState } from "react";
import {
  DollarSign,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  CreditCard,
  Bitcoin,
  Building2,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// ── types ──────────────────────────────────────────────
type TxStatus = "completed" | "pending" | "failed" | "refunded";
type TxType = "deposit" | "withdrawal" | "refund" | "payment" | "earning";
type PaymentMethod = "bank" | "crypto";
type CryptoNetwork = "ethereum" | "bitcoin" | "tron" | "solana";

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  status: TxStatus;
  method: PaymentMethod;
  description: string;
  date: string;
  reference: string;
  network?: CryptoNetwork;
}

// ── mock data ──────────────────────────────────────────
const CALLIXIS_WALLETS: Record<CryptoNetwork, string> = {
  ethereum: "0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9a0B",
  bitcoin: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  tron: "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9",
  solana: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
};

const CALLIXIS_BANK = {
  name: "Callixis Ltd.",
  bank: "JP Morgan Chase",
  routing: "021000021",
  account: "****7832",
  swift: "CHASUS33",
};

const mockTransactions: Transaction[] = [
  { id: "tx-001", type: "deposit", amount: 5000, status: "completed", method: "bank", description: "Bank wire deposit", date: "2026-03-24", reference: "DEP-87231" },
  { id: "tx-002", type: "deposit", amount: 2500, status: "completed", method: "crypto", description: "ETH deposit", date: "2026-03-22", reference: "DEP-87190", network: "ethereum" },
  { id: "tx-003", type: "payment", amount: -1200, status: "completed", method: "bank", description: "Campaign: Real Estate Leads Q1", date: "2026-03-21", reference: "PAY-44120" },
  { id: "tx-004", type: "earning", amount: 3400, status: "completed", method: "bank", description: "Affiliate payout – 340 leads delivered", date: "2026-03-20", reference: "EARN-10982" },
  { id: "tx-005", type: "withdrawal", amount: -2000, status: "pending", method: "crypto", description: "BTC withdrawal request", date: "2026-03-19", reference: "WTH-55431", network: "bitcoin" },
  { id: "tx-006", type: "refund", amount: 800, status: "completed", method: "bank", description: "Refund – duplicate charge", date: "2026-03-18", reference: "REF-33210" },
  { id: "tx-007", type: "deposit", amount: 1000, status: "failed", method: "crypto", description: "SOL deposit – network timeout", date: "2026-03-17", reference: "DEP-87001", network: "solana" },
  { id: "tx-008", type: "payment", amount: -650, status: "completed", method: "bank", description: "Plugin subscription: VoIP Pro", date: "2026-03-15", reference: "PAY-43998" },
];

// ── helpers ────────────────────────────────────────────
const statusConfig: Record<TxStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  completed: { icon: CheckCircle2, label: "Completed", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  pending: { icon: Clock, label: "Pending", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  failed: { icon: XCircle, label: "Failed", className: "bg-destructive/10 text-destructive border-destructive/20" },
  refunded: { icon: RotateCcw, label: "Refunded", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

const typeLabels: Record<TxType, { label: string; color: string }> = {
  deposit: { label: "Deposit", color: "text-emerald-400" },
  withdrawal: { label: "Withdrawal", color: "text-amber-400" },
  refund: { label: "Refund", color: "text-blue-400" },
  payment: { label: "Payment", color: "text-destructive" },
  earning: { label: "Earning", color: "text-primary" },
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard");
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));

// ── sub-components ─────────────────────────────────────
const BalanceCards = ({ balance, pending, earned }: { balance: number; pending: number; earned: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {[
      { title: "Available Balance", value: balance, icon: Wallet, accent: "text-primary" },
      { title: "Pending", value: pending, icon: Clock, accent: "text-amber-400" },
      { title: "Total Earned", value: earned, icon: ArrowDownLeft, accent: "text-emerald-400" },
    ].map((c) => (
      <Card key={c.title} className="bg-card border-border">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center">
            <c.icon className={`h-6 w-6 ${c.accent}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{c.title}</p>
            <p className={`text-2xl font-bold font-display ${c.accent}`}>{formatCurrency(c.value)}</p>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

// ── Deposit Dialog ─────────────────────────────────────
const DepositDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [network, setNetwork] = useState<CryptoNetwork>("ethereum");
  const [amount, setAmount] = useState("");

  const handleDeposit = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    toast.success(`Deposit of ${formatCurrency(Number(amount))} initiated via ${method === "bank" ? "bank transfer" : network.toUpperCase()}`);
    setAmount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Deposit Funds
          </DialogTitle>
          <DialogDescription>All deposits are processed through Callixis escrow accounts.</DialogDescription>
        </DialogHeader>

        <Tabs value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} className="mt-2">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="bank" className="gap-2"><Building2 className="h-4 w-4" /> Bank Transfer</TabsTrigger>
            <TabsTrigger value="crypto" className="gap-2"><Bitcoin className="h-4 w-4" /> Crypto Wallet</TabsTrigger>
          </TabsList>

          {/* Bank tab */}
          <TabsContent value="bank" className="space-y-4 mt-4">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2 text-sm">
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Wire transfer to</p>
              {Object.entries(CALLIXIS_BANK).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center">
                  <span className="text-muted-foreground capitalize">{k}</span>
                  <span className="text-foreground font-mono flex items-center gap-2">
                    {v}
                    <button onClick={() => copyToClipboard(v)} className="hover:text-primary transition-colors">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Crypto tab */}
          <TabsContent value="crypto" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-foreground">Network</Label>
              <Select value={network} onValueChange={(v) => setNetwork(v as CryptoNetwork)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethereum">Ethereum (ETH / USDT / USDC)</SelectItem>
                  <SelectItem value="bitcoin">Bitcoin (BTC)</SelectItem>
                  <SelectItem value="tron">Tron (TRX / USDT)</SelectItem>
                  <SelectItem value="solana">Solana (SOL / USDC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                Send to Callixis {network} wallet
              </p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-foreground bg-background/50 rounded px-2 py-1 break-all flex-1">
                  {CALLIXIS_WALLETS[network]}
                </code>
                <button onClick={() => copyToClipboard(CALLIXIS_WALLETS[network])} className="hover:text-primary transition-colors shrink-0">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="bg-border" />

        <div className="space-y-2">
          <Label className="text-foreground">Amount (USD)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 bg-secondary border-border"
              placeholder="0.00"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Minimum deposit: $50.00 · Processing time: 1-3 business days</p>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleDeposit}>Confirm Deposit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Withdraw Dialog ────────────────────────────────────
const WithdrawDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [network, setNetwork] = useState<CryptoNetwork>("ethereum");
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");

  const handleWithdraw = () => {
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (method === "crypto" && !walletAddress.trim()) { toast.error("Enter your wallet address"); return; }
    toast.success(`Withdrawal of ${formatCurrency(Number(amount))} requested. Processing within 1-5 business days.`);
    setAmount("");
    setWalletAddress("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-amber-400" /> Withdraw Funds
          </DialogTitle>
          <DialogDescription>Withdrawals are processed from your Callixis balance.</DialogDescription>
        </DialogHeader>

        <Tabs value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} className="mt-2">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="bank" className="gap-2"><Building2 className="h-4 w-4" /> Bank Transfer</TabsTrigger>
            <TabsTrigger value="crypto" className="gap-2"><Bitcoin className="h-4 w-4" /> Crypto Wallet</TabsTrigger>
          </TabsList>

          <TabsContent value="bank" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-foreground">Bank Name</Label>
              <Input className="bg-secondary border-border" placeholder="e.g. Chase, Wells Fargo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-foreground">Routing Number</Label>
                <Input className="bg-secondary border-border" placeholder="021000021" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Account Number</Label>
                <Input className="bg-secondary border-border" placeholder="**** **** 7832" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">SWIFT / BIC (international)</Label>
              <Input className="bg-secondary border-border" placeholder="Optional" />
            </div>
          </TabsContent>

          <TabsContent value="crypto" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-foreground">Network</Label>
              <Select value={network} onValueChange={(v) => setNetwork(v as CryptoNetwork)}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethereum">Ethereum</SelectItem>
                  <SelectItem value="bitcoin">Bitcoin</SelectItem>
                  <SelectItem value="tron">Tron</SelectItem>
                  <SelectItem value="solana">Solana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Your Wallet Address</Label>
              <Input
                className="bg-secondary border-border font-mono text-xs"
                placeholder="Paste your wallet address"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="bg-border" />

        <div className="space-y-2">
          <Label className="text-foreground">Amount (USD)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 bg-secondary border-border" placeholder="0.00" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Minimum withdrawal: $100.00 · Fee: 1.5% · Processing: 1-5 business days</p>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleWithdraw} className="bg-amber-500 hover:bg-amber-600 text-background">Request Withdrawal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Refund Dialog ──────────────────────────────────────
const RefundDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const [txRef, setTxRef] = useState("");
  const [reason, setReason] = useState("");

  const handleRefund = () => {
    if (!txRef.trim()) { toast.error("Enter the transaction reference"); return; }
    toast.success(`Refund request submitted for ${txRef}. Our team will review within 48 hours.`);
    setTxRef("");
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-blue-400" /> Request Refund
          </DialogTitle>
          <DialogDescription>Submit a refund request for a specific transaction. Refunds are reviewed by Callixis within 48 hours.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="text-foreground">Transaction Reference</Label>
            <Input className="bg-secondary border-border font-mono" placeholder="e.g. PAY-44120" value={txRef} onChange={(e) => setTxRef(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Reason</Label>
            <Input className="bg-secondary border-border" placeholder="Describe the reason for refund" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleRefund} className="bg-blue-600 hover:bg-blue-700">Submit Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Transaction Row ────────────────────────────────────
const TransactionRow = ({ tx }: { tx: Transaction }) => {
  const [expanded, setExpanded] = useState(false);
  const s = statusConfig[tx.status];
  const StatusIcon = s.icon;
  const t = typeLabels[tx.type];
  const isPositive = tx.amount >= 0;

  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors text-left">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isPositive ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
          {isPositive ? <ArrowDownLeft className="h-4 w-4 text-emerald-400" /> : <ArrowUpRight className="h-4 w-4 text-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{tx.description}</p>
          <p className="text-xs text-muted-foreground">{tx.date} · <span className={t.color}>{t.label}</span></p>
        </div>
        <p className={`text-sm font-semibold font-mono ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
          {isPositive ? "+" : "-"}{formatCurrency(tx.amount)}
        </p>
        <Badge variant="outline" className={`text-xs ${s.className}`}>
          <StatusIcon className="h-3 w-3 mr-1" />{s.label}
        </Badge>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 pl-16 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-muted-foreground">Reference</span><p className="text-foreground font-mono">{tx.reference}</p></div>
          <div><span className="text-muted-foreground">Method</span><p className="text-foreground capitalize">{tx.method}{tx.network ? ` · ${tx.network}` : ""}</p></div>
          <div><span className="text-muted-foreground">Status</span><p className={t.color}>{tx.status}</p></div>
          <div><span className="text-muted-foreground">Processed via</span><p className="text-foreground">Callixis Escrow</p></div>
        </div>
      )}
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────
const Finance = () => {
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [txFilter, setTxFilter] = useState<"all" | TxType>("all");

  const filtered = txFilter === "all" ? mockTransactions : mockTransactions.filter((t) => t.type === txFilter);

  // Extract completed deposit amounts for the piggy bank
  const completedDepositAmounts = mockTransactions
    .filter((t) => t.type === "deposit" && t.status === "completed")
    .map((t) => Math.abs(t.amount));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-foreground">Finance</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your wallet, deposits, withdrawals & refunds</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setDepositOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Deposit</Button>
          <Button onClick={() => setWithdrawOpen(true)} variant="outline" className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"><ArrowUpRight className="h-4 w-4" /> Withdraw</Button>
          <Button onClick={() => setRefundOpen(true)} variant="outline" className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"><RotateCcw className="h-4 w-4" /> Refund</Button>
        </div>
      </div>

      {/* Balances */}
      <BalanceCards balance={8350} pending={2000} earned={14200} />

      {/* Cashback Piggy */}
      <PiggyBank depositAmounts={completedDepositAmounts} />

      {/* How it works */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">How payments work on Callixis</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                All funds flow through <span className="text-primary font-medium">Callixis escrow accounts</span>. 
                Affiliates deposit to fund AI agent campaigns; brands deposit to purchase leads. 
                Earnings are credited to your balance and can be withdrawn to your bank account or crypto wallet at any time.
                Crypto deposits are accepted on Ethereum, Bitcoin, Tron, and Solana networks.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-foreground">Transaction History</CardTitle>
              <CardDescription>All deposits, withdrawals, payments & earnings</CardDescription>
            </div>
            <Select value={txFilter} onValueChange={(v) => setTxFilter(v as typeof txFilter)}>
              <SelectTrigger className="w-[160px] bg-secondary border-border">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="withdrawal">Withdrawals</SelectItem>
                <SelectItem value="payment">Payments</SelectItem>
                <SelectItem value="earning">Earnings</SelectItem>
                <SelectItem value="refund">Refunds</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No transactions found.</div>
          ) : (
            filtered.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} />
      <RefundDialog open={refundOpen} onOpenChange={setRefundOpen} />
    </div>
  );
};

export default Finance;
