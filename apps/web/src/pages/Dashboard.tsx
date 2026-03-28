/**
 * Dashboard redirect — consolidated into Home page.
 * Kept for bookmark / URL compatibility.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const setLocation = useNavigate();
  useEffect(() => {
    setLocation("/home", { replace: true });
  }, [setLocation]);
  return null;
}
