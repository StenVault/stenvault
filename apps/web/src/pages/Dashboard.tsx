/**
 * Dashboard redirect — consolidated into Home page.
 * Kept for bookmark / URL compatibility.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/home", { replace: true });
  }, [setLocation]);
  return null;
}
