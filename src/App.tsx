import { Routes, Route } from "react-router-dom";
import HomePage from "./HomePage";
import Login from "./Login";
import Signup from "./Signup";
import RequireAuth from "./RequireAuth";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}



