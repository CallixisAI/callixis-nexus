import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Store,
  ShoppingCart,
  Search,
  Filter,
  Users,
  BarChart3,
  Plus,
  Clock3,
  Gavel,
  ShieldCheck,
  ArrowRightLeft,
  TicketPercent,
  FileText,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type DealTerm = "CPL" | "CPA" | "CPA + CRG%";
type DealStatus = "open" | "matched" | "expired" | "delivering" | "closed";
type DeskOfferStatus = "leading" | "outbid" | "matched" | "pending" | "cancelled" | "rejected";

type AffiliateDeal = {
  id: string;
  affiliateName: string;
  affiliateUserId: string;
  geo: string;
  source: string;
  funnel: string;
  price: number;
  terms: DealTerm;
  conversionRate: number;
  bidExpiryAt: string;
  leadVolume: number;
  notes: string;
  status: DealStatus;
  offersReceived: number;
  bestDeskBid?: number;
  myAsk: number;
};

type DeskOffer = {
  id: string;
  dealId: string;
  deskUserId: string;
  deskName: string;
  bidPrice: number;
  quantity: number;
  status: DeskOfferStatus;
  reservedAmount: number;
};

const termsOptions: DealTerm[] = ["CPL", "CPA", "CPA + CRG%"];
const geoFilters = ["All", "US", "UK", "EU", "Canada", "Australia"];

const formatCurrency = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const getCountdown = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const Marketplace = () => {
  const { user, profile, role } = useAuth();
  const [side, setSide] = useState<"affiliate" | "desk">("affiliate");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGeo, setSelectedGeo] = useState("All");
  const [affiliateDeals, setAffiliateDeals] = useState<AffiliateDeal[]>([]);
  const [deskOffers, setDeskOffers] = useState<DeskOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidDialog, setBidDialog] = useState<AffiliateDeal | null>(null);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [bidPrice, setBidPrice] = useState("");
  const [bidQuantity, setBidQuantity] = useState("");
  const [newDeal, setNewDeal] = useState({
    geo: "",
    source: "",
    funnel: "",
    price: "",
    terms: "CPL" as DealTerm,
    conversionRate: "",
    bidExpiryHours: "24",
    leadVolume: "",
    notes: "",
  });

  useEffect(() => {
    const loadMarketplace = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const [{ data: dealsData, error: dealsError }, { data: offersData, error: offersError }, { data: profilesData }] = await Promise.all([
          supabase.from("marketplace_deals").select("*").order("created_at", { ascending: false }),
          supabase.from("marketplace_offers").select("*").order("created_at", { ascending: false }),
          supabase.from("profiles").select("id, full_name, email"),
        ]);

        if (dealsError) throw dealsError;
        if (offersError) throw offersError;

        const profileById = new Map((profilesData || []).map((entry) => [entry.id, entry.full_name || entry.email || "User"]));
        const offers = offersData || [];

        const deals: AffiliateDeal[] = (dealsData || []).map((deal) => {
          const relatedOffers = offers.filter((offer) => offer.deal_id === deal.id);
          const bestDeskBid = relatedOffers.length > 0 ? Math.max(...relatedOffers.map((offer) => Number(offer.bid_price))) : undefined;
          return {
            id: deal.id,
            affiliateName: profileById.get(deal.affiliate_user_id) || "Affiliate",
            affiliateUserId: deal.affiliate_user_id,
            geo: deal.geo,
            source: deal.source,
            funnel: deal.funnel,
            price: Number(deal.price),
            terms: deal.terms_type as DealTerm,
            conversionRate: Number(deal.conversion_rate),
            bidExpiryAt: deal.bid_expiry_at,
            leadVolume: deal.lead_volume,
            notes: deal.notes || "",
            status: deal.status as DealStatus,
            offersReceived: relatedOffers.length,
            bestDeskBid,
            myAsk: Number(deal.price),
          };
        });

        const formattedOffers: DeskOffer[] = offers.map((offer) => ({
          id: offer.id,
          dealId: offer.deal_id,
          deskUserId: offer.desk_user_id,
          deskName: profileById.get(offer.desk_user_id) || "Desk",
          bidPrice: Number(offer.bid_price),
          quantity: offer.quantity,
          status: offer.status as DeskOfferStatus,
          reservedAmount: Number(offer.reserved_amount),
        }));

        setAffiliateDeals(deals);
        setDeskOffers(formattedOffers);
      } catch (err: any) {
        toast.error(`Failed to load marketplace: ${err.message || "unknown error"}`);
      } finally {
        setLoading(false);
      }
    };

    loadMarketplace();
  }, [user]);

  const canUseAffiliateView = role === "affiliate" || role === "admin";
  const canUseDeskView = role === "brand" || role === "admin";

  useEffect(() => {
    if (side === "affiliate" && !canUseAffiliateView && canUseDeskView) {
      setSide("desk");
    }
    if (side === "desk" && !canUseDeskView && canUseAffiliateView) {
      setSide("affiliate");
    }
  }, [side, canUseAffiliateView, canUseDeskView]);

  const filteredAffiliateDeals = affiliateDeals.filter((deal) => {
    const matchesSearch = [deal.geo, deal.source, deal.funnel, deal.affiliateName].some((value) => value.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesGeo = selectedGeo === "All" || deal.geo.toLowerCase().includes(selectedGeo.toLowerCase());
    return matchesSearch && matchesGeo;
  });

  const matchedDeals = affiliateDeals.filter((deal) => deal.status === "matched" || deal.status === "delivering");
  const openDeals = affiliateDeals.filter((deal) => deal.status === "open");
  const reservedBalance = deskOffers.reduce((sum, offer) => sum + offer.reservedAmount, 0);

  const createDeal = async () => {
    if (!user) return;
    if (!newDeal.geo || !newDeal.source || !newDeal.funnel || !newDeal.price || !newDeal.conversionRate || !newDeal.leadVolume) {
      toast.error("Fill in the required deal fields first.");
      return;
    }

    try {
      const expiry = new Date(Date.now() + Number(newDeal.bidExpiryHours || 24) * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from("marketplace_deals").insert({
        affiliate_user_id: user.id,
        geo: newDeal.geo,
        source: newDeal.source,
        funnel: newDeal.funnel,
        price: Number(newDeal.price),
        terms_type: newDeal.terms,
        conversion_rate: Number(newDeal.conversionRate),
        bid_expiry_at: expiry,
        lead_volume: Number(newDeal.leadVolume),
        notes: newDeal.notes,
        status: "open",
      }).select().single();

      if (error) throw error;

      const created: AffiliateDeal = {
        id: data.id,
        affiliateName: profile?.full_name || profile?.email || "My Affiliate Desk",
        affiliateUserId: user.id,
        geo: data.geo,
        source: data.source,
        funnel: data.funnel,
        price: Number(data.price),
        terms: data.terms_type as DealTerm,
        conversionRate: Number(data.conversion_rate),
        bidExpiryAt: data.bid_expiry_at,
        leadVolume: data.lead_volume,
        notes: data.notes || "",
        status: data.status as DealStatus,
        offersReceived: 0,
        myAsk: Number(data.price),
      };

      setAffiliateDeals((prev) => [created, ...prev]);
      setNewDeal({ geo: "", source: "", funnel: "", price: "", terms: "CPL", conversionRate: "", bidExpiryHours: "24", leadVolume: "", notes: "" });
      setNewDealOpen(false);
      toast.success("Deal opened for bidding.");
    } catch (err: any) {
      toast.error(`Could not create deal: ${err.message || "unknown error"}`);
    }
  };

  const placeDeskBid = async () => {
    if (!user || !bidDialog) return;
    if (!bidPrice || !bidQuantity || Number(bidPrice) <= 0 || Number(bidQuantity) <= 0) {
      toast.error("Enter a valid bid price and quantity.");
      return;
    }

    const offerValue = Number(bidPrice) * Number(bidQuantity);
    const isMatch = Number(bidPrice) >= bidDialog.myAsk;

    try {
      const { data, error } = await supabase.from("marketplace_offers").insert({
        deal_id: bidDialog.id,
        desk_user_id: user.id,
        bid_price: Number(bidPrice),
        quantity: Number(bidQuantity),
        status: isMatch ? "matched" : "leading",
        reserved_amount: isMatch ? offerValue : 0,
      }).select().single();

      if (error) throw error;

      if (isMatch) {
        const { error: reservationError } = await supabase.from("marketplace_reservations").insert({
          offer_id: data.id,
          desk_user_id: user.id,
          amount: offerValue,
          status: "held",
        });
        if (reservationError) throw reservationError;

        const { error: dealUpdateError } = await supabase.from("marketplace_deals").update({ status: "matched" }).eq("id", bidDialog.id);
        if (dealUpdateError) throw dealUpdateError;
      }

      const createdOffer: DeskOffer = {
        id: data.id,
        dealId: data.deal_id,
        deskUserId: data.desk_user_id,
        deskName: profile?.full_name || profile?.email || "Desk",
        bidPrice: Number(data.bid_price),
        quantity: data.quantity,
        status: data.status as DeskOfferStatus,
        reservedAmount: Number(data.reserved_amount),
      };

      setDeskOffers((prev) => [createdOffer, ...prev]);
      setAffiliateDeals((prev) => prev.map((deal) => deal.id === bidDialog.id ? {
        ...deal,
        offersReceived: deal.offersReceived + 1,
        bestDeskBid: Math.max(deal.bestDeskBid || 0, Number(bidPrice)),
        status: isMatch ? "matched" : deal.status,
      } : deal));

      toast.success(isMatch
        ? `Bid matched. ${formatCurrency(offerValue)} moved into reserved offer balance.`
        : "Bid submitted. Waiting for affiliate decision.");

      setBidDialog(null);
      setBidPrice("");
      setBidQuantity("");
    } catch (err: any) {
      toast.error(`Could not place bid: ${err.message || "unknown error"}`);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading marketplace auctions...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Marketplace Auctions</h1>
          <p className="text-muted-foreground text-sm mt-1">Bid-and-buy traffic marketplace for affiliate deals and desk offers.</p>
        </div>
        {role === "affiliate" || role === "admin" ? (
          <Dialog open={newDealOpen} onOpenChange={setNewDealOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Add Deal</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Affiliate Deal</DialogTitle>
                <DialogDescription>Create a real marketplace auction deal stored in Supabase.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                <div className="space-y-2"><Label>GEO</Label><Input value={newDeal.geo} onChange={(e) => setNewDeal({ ...newDeal, geo: e.target.value })} placeholder="US, UK, DE..." /></div>
                <div className="space-y-2"><Label>Source</Label><Input value={newDeal.source} onChange={(e) => setNewDeal({ ...newDeal, source: e.target.value })} placeholder="Facebook, Search, Native..." /></div>
                <div className="space-y-2"><Label>Funnel</Label><Input value={newDeal.funnel} onChange={(e) => setNewDeal({ ...newDeal, funnel: e.target.value })} placeholder="Mortgage quiz, form flow..." /></div>
                <div className="space-y-2"><Label>Price</Label><Input type="number" value={newDeal.price} onChange={(e) => setNewDeal({ ...newDeal, price: e.target.value })} placeholder="Price per deal" /></div>
                <div className="space-y-2"><Label>Terms</Label><Select value={newDeal.terms} onValueChange={(value) => setNewDeal({ ...newDeal, terms: value as DealTerm })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{termsOptions.map((term) => <SelectItem key={term} value={term}>{term}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Conversion Rate %</Label><Input type="number" value={newDeal.conversionRate} onChange={(e) => setNewDeal({ ...newDeal, conversionRate: e.target.value })} placeholder="Expected conversion rate" /></div>
                <div className="space-y-2"><Label>Bid Expiry (hours)</Label><Input type="number" value={newDeal.bidExpiryHours} onChange={(e) => setNewDeal({ ...newDeal, bidExpiryHours: e.target.value })} placeholder="24" /></div>
                <div className="space-y-2"><Label>Leads To Sell</Label><Input type="number" value={newDeal.leadVolume} onChange={(e) => setNewDeal({ ...newDeal, leadVolume: e.target.value })} placeholder="Lead quantity" /></div>
                <div className="md:col-span-2 space-y-2"><Label>Notes</Label><Textarea value={newDeal.notes} onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })} placeholder="Example: invalid lead deductions, validation rules, timing conditions..." className="min-h-[100px]" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewDealOpen(false)}>Cancel</Button>
                <Button onClick={createDeal}>Open Auction</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <Card className="bg-card border-border p-4 text-xs text-muted-foreground leading-relaxed">
        Deal creation, desk offers, and reserved balance records now persist in the database. Lead delivery into Callixis AI and escrow release validation are the remaining backend steps.
      </Card>

      <Tabs value={side} onValueChange={(value) => setSide(value as "affiliate" | "desk")}>
        <TabsList className="bg-secondary">
          {canUseAffiliateView && <TabsTrigger value="affiliate" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Store className="h-4 w-4" /> Affiliate View</TabsTrigger>}
          {canUseDeskView && <TabsTrigger value="desk" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><ShoppingCart className="h-4 w-4" /> Desk View</TabsTrigger>}
        </TabsList>

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={side === "affiliate" ? "Search deals..." : "Search auctions..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-card border-border" />
          </div>
          <Select value={selectedGeo} onValueChange={setSelectedGeo}>
            <SelectTrigger className="w-48 bg-card border-border"><Filter className="h-4 w-4 mr-2 text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent>{geoFilters.map((geo) => <SelectItem key={geo} value={geo}>{geo}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <TabsContent value="affiliate" className="mt-4 space-y-6">
          {!canUseAffiliateView ? (
            <Card className="bg-card border-border p-6 text-sm text-muted-foreground">Affiliate auction management is available only to affiliate and admin users.</Card>
          ) : (
            <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: "Open Auctions", value: openDeals.length.toString(), icon: Gavel },
              { label: "Matched Deals", value: matchedDeals.length.toString(), icon: CheckCircle2 },
              { label: "Offers Received", value: affiliateDeals.reduce((sum, deal) => sum + deal.offersReceived, 0).toString(), icon: BarChart3 },
              { label: "Lead Inventory", value: affiliateDeals.reduce((sum, deal) => sum + deal.leadVolume, 0).toLocaleString(), icon: Users },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{stat.label}</span><stat.icon className="h-4 w-4 text-primary" /></div>
                <span className="text-xl font-semibold text-foreground">{stat.value}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredAffiliateDeals.map((deal) => (
              <Card key={deal.id} className="bg-card border-border hover:border-primary/40 transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">{deal.funnel}<Badge variant="outline" className="text-[10px]">{deal.terms}</Badge></CardTitle>
                      <CardDescription className="text-xs mt-1">{deal.geo} · {deal.source} · {deal.affiliateName}</CardDescription>
                    </div>
                    <Badge className={deal.status === "matched" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-primary/10 text-primary border-primary/20"}>{deal.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Affiliate Ask</span><p className="text-foreground font-semibold text-sm">{formatCurrency(deal.myAsk)}</p></div>
                    <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Best Desk Bid</span><p className="text-foreground font-semibold text-sm">{deal.bestDeskBid ? formatCurrency(deal.bestDeskBid) : "No bids yet"}</p></div>
                    <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Lead Volume</span><p className="text-foreground font-semibold text-sm">{deal.leadVolume}</p></div>
                    <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Conversion Rate</span><p className="text-foreground font-semibold text-sm">{deal.conversionRate}%</p></div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> Ends in {getCountdown(deal.bidExpiryAt)}</span>
                    <span className="flex items-center gap-1"><Gavel className="h-3 w-3" /> {deal.offersReceived} offers</span>
                  </div>

                  <div className="rounded-lg bg-secondary/30 border border-border p-3">
                    <div className="flex items-center gap-2 mb-2"><FileText className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-medium text-foreground">Affiliate Notes</span></div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{deal.notes}</p>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={deal.bestDeskBid && deal.bestDeskBid >= deal.myAsk ? "text-emerald-400" : "text-amber-400"}>
                      {deal.bestDeskBid && deal.bestDeskBid >= deal.myAsk ? "Match reached. Ready for lead delivery." : "Monitoring desk offers."}
                    </span>
                    <Button size="sm" variant="outline" className="text-xs">View Offers</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="desk" className="mt-4 space-y-6">
          {!canUseDeskView ? (
            <Card className="bg-card border-border p-6 text-sm text-muted-foreground">Desk bidding is available only to brand and admin users.</Card>
          ) : (
            <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: "Open Auctions", value: filteredAffiliateDeals.filter((deal) => deal.status === "open").length.toString(), icon: Gavel },
              { label: "My Offers", value: deskOffers.filter((offer) => offer.deskUserId === user?.id).length.toString(), icon: TicketPercent },
              { label: "Reserved Balance", value: formatCurrency(reservedBalance), icon: ShieldCheck },
              { label: "Matched Volume", value: deskOffers.filter((offer) => offer.status === "matched").reduce((sum, offer) => sum + offer.quantity, 0).toString(), icon: ArrowRightLeft },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{stat.label}</span><stat.icon className="h-4 w-4 text-primary" /></div>
                <span className="text-xl font-semibold text-foreground">{stat.value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {filteredAffiliateDeals.map((deal) => {
              const myOffer = deskOffers.find((offer) => offer.dealId === deal.id && offer.deskUserId === user?.id);
              return (
                <Card key={deal.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-foreground">{deal.funnel}</h3>
                          <Badge variant="outline" className="text-[10px]">{deal.terms}</Badge>
                          <Badge className={deal.status === "matched" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-primary/10 text-primary border-primary/20"}>{deal.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{deal.affiliateName} · {deal.geo} · {deal.source}</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                          <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Affiliate Ask</span><p className="text-foreground font-semibold text-sm">{formatCurrency(deal.myAsk)}</p></div>
                          <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Current Desk Bid</span><p className="text-foreground font-semibold text-sm">{deal.bestDeskBid ? formatCurrency(deal.bestDeskBid) : "—"}</p></div>
                          <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Traffic Wanted</span><p className="text-foreground font-semibold text-sm">{deal.leadVolume}</p></div>
                          <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Countdown</span><p className="text-foreground font-semibold text-sm">{getCountdown(deal.bidExpiryAt)}</p></div>
                          <div className="bg-secondary/50 rounded-md p-3"><span className="text-muted-foreground">Spread</span><p className="text-foreground font-semibold text-sm">{formatCurrency(Math.max(0, deal.myAsk - (deal.bestDeskBid || 0)))}</p></div>
                        </div>
                        <div className="rounded-lg bg-secondary/30 border border-border p-3">
                          <div className="flex items-center gap-2 mb-2"><AlertCircle className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-medium text-foreground">Deal Notes</span></div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{deal.notes}</p>
                        </div>
                        {myOffer && (
                          <div className="flex items-center justify-between text-xs rounded-lg border border-border p-3 bg-background/40">
                            <span className="text-muted-foreground">My offer: {formatCurrency(myOffer.bidPrice)} x {myOffer.quantity}</span>
                            <span className={myOffer.status === "matched" ? "text-emerald-400" : "text-amber-400"}>{myOffer.status === "matched" ? `Reserved ${formatCurrency(myOffer.reservedAmount)}` : myOffer.status}</span>
                          </div>
                        )}
                      </div>
                      {(role === "brand" || role === "admin") && (
                        <Button className="gap-2 shrink-0" onClick={() => {
                          setBidDialog(deal);
                          setBidPrice(myOffer ? String(myOffer.bidPrice) : "");
                          setBidQuantity(myOffer ? String(myOffer.quantity) : "");
                        }}>
                          <Gavel className="h-4 w-4" /> Place Offer
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!bidDialog} onOpenChange={(open) => !open && setBidDialog(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2"><Gavel className="h-5 w-5 text-primary" /> Submit Desk Offer</DialogTitle>
            <DialogDescription>If your bid matches the affiliate ask, the value moves into reserved offer balance until lead delivery is validated.</DialogDescription>
          </DialogHeader>
          {bidDialog && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">{bidDialog.funnel}</p>
                <p className="text-xs text-muted-foreground">{bidDialog.affiliateName} · {bidDialog.geo}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Desk Bid Price</Label><Input type="number" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} /></div>
                <div className="space-y-2"><Label>Traffic Quantity</Label><Input type="number" value={bidQuantity} onChange={(e) => setBidQuantity(e.target.value)} /></div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Affiliate Ask</span><span className="text-foreground">{formatCurrency(bidDialog.myAsk)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">My Bid</span><span className="text-foreground">{bidPrice ? formatCurrency(Number(bidPrice)) : "—"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Quantity</span><span className="text-foreground">{bidQuantity || "—"}</span></div>
                <div className="border-t border-border pt-2 flex justify-between text-sm font-bold"><span className="text-foreground">Potential Reservation</span><span className="text-primary">{formatCurrency(Number(bidPrice || 0) * Number(bidQuantity || 0))}</span></div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setBidDialog(null)}>Cancel</Button>
                <Button onClick={placeDeskBid}>Submit Offer</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplace;
