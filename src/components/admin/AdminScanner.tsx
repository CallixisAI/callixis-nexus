import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCcw, Key } from "lucide-react";

export default function AdminScanner() {
  const [gifts, setGifts] = useState<any[]>([]);
  const [scannerKey, setScannerKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Get the first scanner key
    const { data: keys } = await supabase.from('scanner_keys').select('key').limit(1);
    if (keys && keys.length > 0) {
      setScannerKey(keys[0].key);
    }

    // Get the gift history
    const { data: giftsData, error } = await supabase
      .from('scanned_gifts')
      .select('*')
      .order('scanned_at', { ascending: false })
      .limit(50);

    if (error) {
      toast.error("Failed to load scanner data");
    } else {
      setGifts(giftsData || []);
    }
    setLoading(false);
  };

  const copyKey = () => {
    if (scannerKey) {
      navigator.clipboard.writeText(scannerKey);
      toast.success("Scanner key copied to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Chest Scanner</h2>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scanner Key</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold truncate max-w-[200px]">
                {scannerKey || "No key generated"}
              </code>
              <Button size="icon" variant="ghost" onClick={copyKey}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Paste this into your browser script settings.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Chest/Gift</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No scans recorded yet. Open the game's Gift page to start scanning.
                  </TableCell>
                </TableRow>
              ) : (
                gifts.map((gift) => (
                  <TableRow key={gift.id}>
                    <TableCell className="font-medium">{gift.player_name}</TableCell>
                    <TableCell>{gift.gift_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{gift.amount}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(gift.scanned_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
