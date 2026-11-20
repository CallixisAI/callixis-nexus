import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCcw, Database, User, ShieldCheck } from "lucide-react";

const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbw0IWizKtOi-2yf8-25Aq4ABIXW1kggQH7oKiilGZRfvDatmpNTi3MsqFPkbIh6IHcw/exec";

export default function AdminScanner() {
  const [gifts, setGifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(GOOGLE_SHEET_URL);
      const data = await response.json();
      setGifts(data);
    } catch (error) {
      console.error("Failed to fetch:", error);
      toast.error("Could not load scanner data from Google Sheets");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clan Chest Logs</h2>
          <p className="text-muted-foreground mt-1">Real-time scans from Total Battle via Google Sheets</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
          <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Scans</CardTitle>
            <Database className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gifts.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30 border-b">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Live Scan History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[180px]">Scan Time</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Chest/Gift Name</TableHead>
                <TableHead className="text-center">Lvl</TableHead>
                <TableHead className="text-center">Crypt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                    Connecting to Google Sheets...
                  </TableCell>
                </TableRow>
              ) : gifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No scan data found. Make sure the scanner is running on your PC.
                  </TableCell>
                </TableRow>
              ) : (
                gifts.map((gift, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(gift.time).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-semibold flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {gift.player}
                    </TableCell>
                    <TableCell>{gift.chest}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                        {gift.level || '1'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        {gift.crypt || '0'}
                      </Badge>
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
