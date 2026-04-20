-- Marketplace auction model for affiliate deals, desk bids, reserved funds, and delivery validation.

CREATE TABLE IF NOT EXISTS public.marketplace_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  geo TEXT NOT NULL,
  source TEXT NOT NULL,
  funnel TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  terms_type TEXT NOT NULL CHECK (terms_type IN ('CPL', 'CPA', 'CPA + CRG%')),
  conversion_rate NUMERIC NOT NULL DEFAULT 0,
  bid_expiry_at TIMESTAMP WITH TIME ZONE NOT NULL,
  lead_volume INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'expired', 'delivering', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.marketplace_deals(id) ON DELETE CASCADE NOT NULL,
  desk_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bid_price NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leading', 'outbid', 'matched', 'cancelled', 'rejected')),
  reserved_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES public.marketplace_offers(id) ON DELETE CASCADE NOT NULL,
  desk_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'paid_out', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.marketplace_deals(id) ON DELETE CASCADE NOT NULL,
  offer_id UUID REFERENCES public.marketplace_offers(id) ON DELETE CASCADE SET NULL,
  affiliate_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  desk_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  delivered_leads INTEGER NOT NULL DEFAULT 0,
  accepted_leads INTEGER NOT NULL DEFAULT 0,
  rejected_leads INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'partial', 'rejected', 'disputed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view marketplace deals"
  ON public.marketplace_deals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Affiliates can insert own marketplace deals"
  ON public.marketplace_deals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = affiliate_user_id);

CREATE POLICY "Affiliates can update own marketplace deals"
  ON public.marketplace_deals FOR UPDATE
  TO authenticated
  USING (auth.uid() = affiliate_user_id);

CREATE POLICY "Users can view marketplace offers"
  ON public.marketplace_offers FOR SELECT
  TO authenticated
  USING (
    auth.uid() = desk_user_id OR
    EXISTS (
      SELECT 1 FROM public.marketplace_deals deal
      WHERE deal.id = deal_id AND deal.affiliate_user_id = auth.uid()
    )
  );

CREATE POLICY "Desks can insert own marketplace offers"
  ON public.marketplace_offers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = desk_user_id);

CREATE POLICY "Desks can update own marketplace offers"
  ON public.marketplace_offers FOR UPDATE
  TO authenticated
  USING (auth.uid() = desk_user_id);

CREATE POLICY "Users can view own reservations"
  ON public.marketplace_reservations FOR SELECT
  TO authenticated
  USING (auth.uid() = desk_user_id);

CREATE POLICY "Desks can insert own reservations"
  ON public.marketplace_reservations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = desk_user_id);

CREATE POLICY "Desks can update own reservations"
  ON public.marketplace_reservations FOR UPDATE
  TO authenticated
  USING (auth.uid() = desk_user_id);

CREATE POLICY "Users can view related deliveries"
  ON public.marketplace_deliveries FOR SELECT
  TO authenticated
  USING (auth.uid() = affiliate_user_id OR auth.uid() = desk_user_id);

CREATE POLICY "Affiliates can insert deliveries for own deals"
  ON public.marketplace_deliveries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = affiliate_user_id);

CREATE POLICY "Participants can update related deliveries"
  ON public.marketplace_deliveries FOR UPDATE
  TO authenticated
  USING (auth.uid() = affiliate_user_id OR auth.uid() = desk_user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_deals_affiliate_user_id ON public.marketplace_deals(affiliate_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_deals_status ON public.marketplace_deals(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_deals_bid_expiry_at ON public.marketplace_deals(bid_expiry_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_offers_deal_id ON public.marketplace_offers(deal_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_offers_desk_user_id ON public.marketplace_offers(desk_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reservations_offer_id ON public.marketplace_reservations(offer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_deliveries_deal_id ON public.marketplace_deliveries(deal_id);

DROP TRIGGER IF EXISTS set_updated_at_marketplace_deals ON public.marketplace_deals;
CREATE TRIGGER set_updated_at_marketplace_deals
BEFORE UPDATE ON public.marketplace_deals
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_marketplace_offers ON public.marketplace_offers;
CREATE TRIGGER set_updated_at_marketplace_offers
BEFORE UPDATE ON public.marketplace_offers
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_marketplace_reservations ON public.marketplace_reservations;
CREATE TRIGGER set_updated_at_marketplace_reservations
BEFORE UPDATE ON public.marketplace_reservations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_marketplace_deliveries ON public.marketplace_deliveries;
CREATE TRIGGER set_updated_at_marketplace_deliveries
BEFORE UPDATE ON public.marketplace_deliveries
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
