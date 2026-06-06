import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
