import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DemoModeToggle() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const active = localStorage.getItem("callixis_demo_mode") === "true";
    setIsDemo(active);
  }, []);

  const toggleDemo = () => {
    const next = !isDemo;
    setIsDemo(next);
    localStorage.setItem("callixis_demo_mode", next ? "true" : "false");
    window.location.reload();
  };

  return (
    <Button
      variant={isDemo ? "default" : "outline"}
      size="sm"
      onClick={toggleDemo}
      className="gap-2 text-xs font-medium"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {isDemo ? "Demo Mode: Active" : "Enable Demo Mode"}
    </Button>
  );
}
