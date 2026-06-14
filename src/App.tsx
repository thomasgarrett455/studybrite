import { Routes, Route } from "react-router-dom";
import AppShell from "./AppShell";
import Home from "./components/Home";
import ClassroomView from "./components/ClassroomView";
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
            <AppShell />
          </RequireAuth>
        }
      >
        {/* Home — chat is classroom-scoped, so the index just points into a classroom. */}
        <Route index element={<Home />} />
        <Route path="classrooms/:id" element={<ClassroomView />} />
      </Route>
    </Routes>
  );
}
