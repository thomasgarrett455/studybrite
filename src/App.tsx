import { Routes, Route } from "react-router-dom";
import AppShell from "./AppShell";
import ChatArea from "./components/ChatArea";
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
        {/* Home / command surface — the chat lives here. */}
        <Route index element={<ChatArea />} />
        <Route path="classrooms/:id" element={<ClassroomView />} />
      </Route>
    </Routes>
  );
}
