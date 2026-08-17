import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { auth, googleProvider } from "./firebase.js";

const API_URL = import.meta.env.VITE_API_URL?.replace(
  /\/+$/,
  "",
);

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
        setError("");
      },
      (authError) => {
        console.error(
          "Firebase authentication state error:",
          authError,
        );
        setUser(null);
        setAuthReady(true);
        setError(
          "Authentication could not be completed.",
        );
      },
    );

    return unsubscribe;
  }, []);

  async function handleGoogleSignIn() {
    setError("");

    try {
      const result = await signInWithPopup(
        auth,
        googleProvider,
      );

      // Ensures immediate UI transition after popup login.
      setUser(result.user);
    } catch (signInError) {
      console.error(
        "Google sign-in failed:",
        signInError,
      );

      if (
        signInError.code ===
        "auth/popup-closed-by-user"
      ) {
        setError("Google sign-in was cancelled.");
        return;
      }

      if (
        signInError.code === "auth/popup-blocked"
      ) {
        setError(
          "The browser blocked the sign-in popup. Allow popups and try again.",
        );
        return;
      }

      setError(
        signInError.message ||
          "Google sign-in failed.",
      );
    }
  }

  async function handleSignOut() {
    setError("");

    try {
      await signOut(auth);
      setUser(null);
      setMessages([]);
      setQuestion("");
      localStorage.removeItem(
        "atomic_habits_session_id",
      );
    } catch (signOutError) {
      console.error(
        "Google sign-out failed:",
        signOutError,
      );
      setError("Sign-out could not be completed.");
    }
  }

  async function askQuestion(event) {
    event.preventDefault();

    const message = question.trim();

    if (!message || !user || busy) {
      return;
    }

    if (!API_URL) {
      setError(
        "The Agent API URL is not configured.",
      );
      return;
    }

    setQuestion("");
    setBusy(true);
    setError("");

    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: message,
      },
    ]);

    try {
      const firebaseToken =
        await user.getIdToken();

      const sessionId = localStorage.getItem(
        "atomic_habits_session_id",
      );

      const response = await fetch(
        `${API_URL}/chat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firebaseToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            session_id: sessionId,
          }),
        },
      );

      let data;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            `The request failed with status ${response.status}.`,
        );
      }

      if (!data?.answer) {
        throw new Error(
          "The Agent API did not return an answer.",
        );
      }

      if (data.session_id) {
        localStorage.setItem(
          "atomic_habits_session_id",
          data.session_id,
        );
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: data.answer,
        },
      ]);
    } catch (requestError) {
      console.error(
        "Chat request failed:",
        requestError,
      );

      setError(
        requestError.message ||
          "The question could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return (
      <main className="centered">
        <section className="login-card">
          <p className="eyebrow">
            DOCUMENT-GROUNDED AI
          </p>
          <h1>Atomic Habits Assistant</h1>
          <p>Checking your Google login…</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="centered">
        <section className="login-card">
          <p className="eyebrow">
            DOCUMENT-GROUNDED AI
          </p>

          <h1>Atomic Habits Assistant</h1>

          <p>
            Ask questions and receive answers
            grounded in the book.
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
          >
            Continue with Google
          </button>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">
            ATOMIC HABITS
          </p>
          <h1>Document Assistant</h1>
          <p>
            Signed in as{" "}
            {user.displayName || user.email}
          </p>
        </div>

        <button
          className="secondary"
          type="button"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </header>

      <section className="chat-panel">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              Ask “What is the two-minute rule?”
              to get started.
            </div>
          )}

          {messages.map(
            (message, index) => (
              <article
                className={`message ${message.role}`}
                key={`${message.role}-${index}`}
              >
                <strong>
                  {message.role === "user"
                    ? "You"
                    : "Assistant"}
                </strong>
                <p>{message.text}</p>
              </article>
            ),
          )}

          {busy && (
            <div className="status">
              Searching the document…
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={askQuestion}>
          <input
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            placeholder="Ask about Atomic Habits"
            maxLength={500}
            disabled={busy}
          />

          <button
            disabled={
              busy || !question.trim()
            }
            type="submit"
          >
            {busy ? "Searching…" : "Ask"}
          </button>
        </form>
      </section>
    </main>
  );
}