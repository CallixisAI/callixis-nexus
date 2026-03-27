import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Store, ShoppingCart, TrendingUp, Star, Search, Filter,
  Users, Phone, DollarSign, BarChart3, Eye, Shield, Zap,
  CheckCircle2, ArrowUpRight, Globe, Building2, Heart, Car,
  Home, Landmark, PiggyBank, Plus,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

type Offer = {
  id: string;
  affiliateName: string;
  title: string;
  industry: string;
  industryIcon: React.ElementType;
  description: string;
  pricePerLead: number;
  conversionRate: number;
  totalLeads: number;
  successRate: number;
  avgCallDuration: string;
  rating: number;
  verified: boolean;
  featured: boolean;
  aiAgents: number;
  activeCallers: number;
  geo: string;
};

const mockOffers: Offer[] = [
  {
    id: "1", affiliateName: "LeadGen Pro", title: "Premium Real Estate Leads", industry: "Real Estate", industryIcon: Home,
    description: "High-intent homebuyer leads from AI-driven outbound campaigns targeting pre-qualified prospects in top US metros.",
    pricePerLead: 45, conversionRate: 18.5, totalLeads: 12400, successRate: 92, avgCallDuration: "4:32",
    rating: 4.8, verified: true, featured: true, aiAgents: 8, activeCallers: 24, geo: "US - Top 20 Metros",
  },
  {
    id: "2", affiliateName: "MedConnect AI", title: "Medicare Enrollment Leads", industry: "Medical", industryIcon: Heart,
    description: "Medicare-eligible seniors contacted via compliant AI agents. TCPA-compliant with warm transfers available.",
    pricePerLead: 65, conversionRate: 22.1, totalLeads: 8900, successRate: 88, avgCallDuration: "5:15",
    rating: 4.6, verified: true, featured: true, aiAgents: 12, activeCallers: 18, geo: "US Nationwide",
  },
  {
    id: "3", affiliateName: "FinanceFirst", title: "Auto Insurance Leads", industry: "Insurance", industryIcon: Shield,
    description: "AI-generated auto insurance leads with multi-carrier quoting intent. Real-time transfer capability.",
    pricePerLead: 35, conversionRate: 15.3, totalLeads: 21000, successRate: 85, avgCallDuration: "3:48",
    rating: 4.4, verified: true, featured: false, aiAgents: 6, activeCallers: 30, geo: "US - 48 States",
  },
  {
    id: "4", affiliateName: "BankFlow", title: "Personal Loan Applications", industry: "Finance", industryIcon: Landmark,
    description: "Pre-qualified personal loan applicants generated through AI outreach. Credit score 650+ verified.",
    pricePerLead: 80, conversionRate: 12.8, totalLeads: 5600, successRate: 90, avgCallDuration: "6:02",
    rating: 4.7, verified: true, featured: false, aiAgents: 4, activeCallers: 12, geo: "US Nationwide",
  },
  {
    id: "5", affiliateName: "HomeImprov AI", title: "Home Renovation Leads", industry: "Home Improvement", industryIcon: Home,
    description: "Homeowners interested in kitchen, bath, and roofing renovations. Geo-targeted to contractor service areas.",
    pricePerLead: 28, conversionRate: 20.5, totalLeads: 15800, successRate: 87, avgCallDuration: "3:22",
    rating: 4.3, verified: false, featured: false, aiAgents: 5, activeCallers: 16, geo: "US - Regional",
  },
  {
    id: "6", affiliateName: "AutoDeal Network", title: "Car Buyer Leads", industry: "Car Sales", industryIcon: Car,
    description: "In-market car buyers with make/model preference data. AI agents qualify budget and timeline.",
    pricePerLead: 55, conversionRate: 16.9, totalLeads: 9200, successRate: 83, avgCallDuration: "4:10",
    rating: 4.5, verified: true, featured: true, aiAgents: 7, activeCallers: 20, geo: "US - Major Markets",
  },
];

const industries = ["All", "Real Estate", "Medical", "Insurance", "Finance", "Home Improvement", "Car Sales"];

type BrandListing = {
  id: string;
  brandName: string;
  title: string;
  industry: string;
  budgetPerLead: number;
  monthlyVolume: number;
  requirements: string;
  geo: string;
  status: "open" | "in-progress" | "filled";
};

const mockBrandListings: BrandListing[] = [
  { id: "b1", brandName: "Sunrise Realty", title: "Looking for Homebuyer Leads in FL", industry: "Real Estate", budgetPerLead: 50, monthlyVolume: 500, requirements: "Pre-qualified, credit score 680+, looking to buy within 6 months", geo: "Florida", status: "open" },
  { id: "b2", brandName: "SafeGuard Insurance", title: "Auto Insurance Live Transfers", industry: "Insurance", budgetPerLead: 40, monthlyVolume: 1000, requirements: "Real-time transfers only, multi-car households preferred", geo: "US Nationwide", status: "open" },
  { id: "b3", brandName: "Premier Auto Group", title: "In-Market Car Buyers Needed", industry: "Car Sales", budgetPerLead: 60, monthlyVolume: 300, requirements: "Budget $25k+, ready to purchase within 30 days", geo: "Texas, California", status: "in-progress" },
  { id: "b4", brandName: "MediCare Plus", title: "Medicare Supplement Enrollments", industry: "Medical", budgetPerLead: 75, monthlyVolume: 800, requirements: "Age 65+, T65 turning 65 in 90 days, AEP/OEP compliant", geo: "US Nationwide", status: "open" },
];

const Marketplace = () => {
  const navigate = useNavigate();
  const [side, setSide] = useState<"affiliate" | "brand">("affiliate");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("All");
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [buyDialog, setBuyDialog] = useState<Offer | null>(null);
  const [buyQuantity, setBuyQuantity] = useState("10");
  const walletBalance = 8500; // mock — would come from shared state/DB

  const filteredOffers = mockOffers.filter((o) => {
    const matchesSearch = o.title.toLowerCase().includes(searchQuery.toLowerCase()) || o.affiliateName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesIndustry = selectedIndustry === "All" || o.industry === selectedIndustry;
    return matchesSearch && matchesIndustry;
  });

  const filteredBrandListings = mockBrandListings.filter((l) => {
    const matchesSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase()) || l.brandName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesIndustry = selectedIndustry === "All" || l.industry === selectedIndustry;
    return matchesSearch && matchesIndustry;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Marketplace</h1>
          <p className="text-muted-foreground text-sm mt-1">Buy and sell AI-generated leads across industries</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Create Listing
        </Button>
      </div>

      {/* Side Switcher */}
      <Tabs value={side} onValueChange={(v) => setSide(v as "affiliate" | "brand")}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="affiliate" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Store className="h-4 w-4" /> Affiliate Offers
          </TabsTrigger>
          <TabsTrigger value="brand" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ShoppingCart className="h-4 w-4" /> Brand Requests
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={side === "affiliate" ? "Search offers..." : "Search brand requests..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
            <SelectTrigger className="w-48 bg-card border-border">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Affiliate Offers Tab */}
        <TabsContent value="affiliate" className="mt-4">
          {/* Stats Banner */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Active Offers", value: mockOffers.length.toString(), icon: Store },
              { label: "Total Leads Available", value: "72.9K", icon: Users },
              { label: "Avg. Price/Lead", value: "$51.33", icon: DollarSign },
              { label: "Avg. Conversion", value: "17.7%", icon: TrendingUp },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-4 glow-cyan">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xl font-semibold text-foreground">{s.value}</span>
              </div>
            ))}
          </div>

          {/* Offer Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredOffers.map((offer) => (
              <Card key={offer.id} className={`bg-card border-border hover:border-primary/40 transition-all cursor-pointer group ${offer.featured ? "ring-1 ring-primary/20" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center">
                        <offer.industryIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-foreground">{offer.title}</CardTitle>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {offer.affiliateName}
                          {offer.verified && <CheckCircle2 className="h-3 w-3 text-primary" />}
                        </p>
                      </div>
                    </div>
                    {offer.featured && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Featured</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="pb-3 space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2">{offer.description}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-secondary/50 rounded-md p-2">
                      <span className="text-muted-foreground">Price/Lead</span>
                      <p className="text-foreground font-semibold text-sm">${offer.pricePerLead}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-md p-2">
                      <span className="text-muted-foreground">Conversion</span>
                      <p className="text-foreground font-semibold text-sm">{offer.conversionRate}%</p>
                    </div>
                    <div className="bg-secondary/50 rounded-md p-2">
                      <span className="text-muted-foreground">Total Leads</span>
                      <p className="text-foreground font-semibold text-sm">{offer.totalLeads.toLocaleString()}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-md p-2">
                      <span className="text-muted-foreground">Success Rate</span>
                      <p className="text-foreground font-semibold text-sm">{offer.successRate}%</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{offer.aiAgents} AI Agents</span>
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{offer.geo}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3 w-3 ${i < Math.floor(offer.rating) ? "text-primary fill-primary" : "text-muted-foreground/30"}`} />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">{offer.rating}</span>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setSelectedOffer(offer)}>
                        <Eye className="h-3 w-3 mr-1" /> Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border max-w-lg">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                          <offer.industryIcon className="h-5 w-5 text-primary" />
                          {offer.title}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">{offer.description}</p>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { l: "Price per Lead", v: `$${offer.pricePerLead}` },
                            { l: "Conversion Rate", v: `${offer.conversionRate}%` },
                            { l: "Total Leads Generated", v: offer.totalLeads.toLocaleString() },
                            { l: "Success Rate", v: `${offer.successRate}%` },
                            { l: "AI Agents Active", v: offer.aiAgents.toString() },
                            { l: "Active Callers", v: offer.activeCallers.toString() },
                            { l: "Avg Call Duration", v: offer.avgCallDuration },
                            { l: "Geography", v: offer.geo },
                          ].map((item) => (
                            <div key={item.l} className="bg-secondary/50 rounded-md p-3">
                              <span className="text-xs text-muted-foreground">{item.l}</span>
                              <p className="text-sm font-semibold text-foreground">{item.v}</p>
                            </div>
                          ))}
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Performance</span>
                          <Progress value={offer.successRate} className="mt-1 h-2" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button className="w-full gap-2" onClick={() => { setBuyDialog(offer); }}>
                          <ShoppingCart className="h-4 w-4" /> Purchase Leads
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" className="flex-1 text-xs gap-1" onClick={() => setBuyDialog(offer)}>
                    <ShoppingCart className="h-3 w-3" /> Buy Leads
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Brand Requests Tab */}
        <TabsContent value="brand" className="mt-4">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Open Requests", value: mockBrandListings.filter((l) => l.status === "open").length.toString(), icon: ShoppingCart },
              { label: "Total Monthly Volume", value: "2,600", icon: BarChart3 },
              { label: "Avg. Budget/Lead", value: "$56.25", icon: DollarSign },
              { label: "Active Brands", value: mockBrandListings.length.toString(), icon: Building2 },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-4 glow-cyan">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xl font-semibold text-foreground">{s.value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {filteredBrandListings.map((listing) => (
              <Card key={listing.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-foreground">{listing.title}</h3>
                        <Badge variant={listing.status === "open" ? "default" : "secondary"} className={listing.status === "open" ? "bg-primary/10 text-primary border-primary/20" : ""}>
                          {listing.status === "open" ? "Open" : listing.status === "in-progress" ? "In Progress" : "Filled"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        <span className="font-medium text-foreground">{listing.brandName}</span> · {listing.industry} · {listing.geo}
                      </p>
                      <p className="text-xs text-muted-foreground mb-3">{listing.requirements}</p>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-muted-foreground">Budget: <span className="text-foreground font-semibold">${listing.budgetPerLead}/lead</span></span>
                        <span className="text-muted-foreground">Volume: <span className="text-foreground font-semibold">{listing.monthlyVolume.toLocaleString()}/mo</span></span>
                      </div>
                    </div>
                    <Button className="gap-2 shrink-0">
                      <ArrowUpRight className="h-4 w-4" /> Apply as Affiliate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Buy Leads Dialog */}
      <Dialog open={!!buyDialog} onOpenChange={(o) => !o && setBuyDialog(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" /> Purchase Leads
            </DialogTitle>
          </DialogHeader>
          {buyDialog && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">{buyDialog.title}</p>
                <p className="text-xs text-muted-foreground">{buyDialog.affiliateName} · {buyDialog.geo}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Quantity</Label>
                <Input type="number" min="1" value={buyQuantity} onChange={(e) => setBuyQuantity(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price per lead</span>
                  <span className="text-foreground">${buyDialog.pricePerLead}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="text-foreground">{buyQuantity}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">${(buyDialog.pricePerLead * Number(buyQuantity || 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Wallet Balance</span>
                  <span className={walletBalance >= buyDialog.pricePerLead * Number(buyQuantity || 0) ? "text-emerald-400" : "text-destructive"}>
                    ${walletBalance.toLocaleString()}
                  </span>
                </div>
              </div>
              {walletBalance < buyDialog.pricePerLead * Number(buyQuantity || 0) && (
                <p className="text-xs text-destructive">Insufficient balance. <button onClick={() => navigate("/finance")} className="text-primary hover:underline">Add funds →</button></p>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setBuyDialog(null)}>Cancel</Button>
                <Button
                  disabled={walletBalance < buyDialog.pricePerLead * Number(buyQuantity || 0) || Number(buyQuantity) <= 0}
                  onClick={() => {
                    const total = buyDialog.pricePerLead * Number(buyQuantity);
                    toast.success(`Purchased ${buyQuantity} leads for $${total.toLocaleString()}. Transaction recorded in Finance.`);
                    setBuyDialog(null);
                  }}
                  className="glow-cyan"
                >
                  Confirm Purchase
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplace;
