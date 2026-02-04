import { useMemo, useState } from "react";

export default function LoginView({
  onLogin,
  errorMessage,
  sessionMessage,
  onClearSessionMessage,
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return username.trim().length > 0 && password.length > 0 && !loading;
  }, [username, password, loading]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setLoading(true);
      await onLogin?.({ username: username.trim(), password });
    } finally {
      setLoading(false);
    }
  }

  function handleChangeUsername(v) {
    setUsername(v);
    onClearSessionMessage?.();
  }

  function handleChangePassword(v) {
    setPassword(v);
    onClearSessionMessage?.();
  }

  return (
    <div style={styles.overlay}>
      {/* background */}
      <div style={styles.bg} />
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      {/* centered card */}
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.dot} />
          <div>
            <div style={styles.title}>PDU MONITOR</div>
            <div style={styles.sub}>Sign in</div>
          </div>
        </div>

        <div style={styles.divider} />

        {/* 🔔 SESSION MESSAGE (หมดอายุ / ถูก logout) */}
        {(sessionMessage || "").trim() && (
          <div style={styles.sessionBox}>
            <div>{sessionMessage}</div>
            <button
              onClick={onClearSessionMessage}
              style={styles.sessionBtn}
              type="button"
            >
              รับทราบ
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={username}
            onChange={(e) => handleChangeUsername(e.target.value)}
            placeholder="Enter username"
            autoComplete="username"
          />

          <div style={{ height: 12 }} />

          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            value={password}
            onChange={(e) => handleChangePassword(e.target.value)}
            placeholder="Enter password"
            type="password"
            autoComplete="current-password"
          />

          {(errorMessage || "").trim() ? (
            <div style={styles.error}>{errorMessage}</div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{ ...styles.btn, opacity: canSubmit ? 1 : 0.6 }}
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 16,
    overflow: "hidden",
    zIndex: 9999,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },

  bg: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, #0b0f14 0%, #0a0d12 55%, #070a0f 100%)",
  },
  glow1: {
    position: "absolute",
    width: 560,
    height: 560,
    borderRadius: "50%",
    background: "rgba(13,110,253,0.16)",
    filter: "blur(95px)",
    left: "-200px",
    top: "-200px",
    pointerEvents: "none",
  },
  glow2: {
    position: "absolute",
    width: 560,
    height: 560,
    borderRadius: "50%",
    background: "rgba(155,107,255,0.14)",
    filter: "blur(105px)",
    right: "-220px",
    bottom: "-220px",
    pointerEvents: "none",
  },

  card: {
    width: "min(440px, 92vw)",
    background: "rgba(22, 26, 33, 0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.60)",
    borderRadius: 16,
    padding: 20,
    position: "relative",
    zIndex: 1,
    backdropFilter: "blur(10px)",
  },

  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#0D6EFD",
    boxShadow: "0 0 18px rgba(13,110,253,0.65)",
  },
  title: {
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: "#9CC6FF",
  },
  sub: { fontSize: 12, opacity: 0.7, marginTop: 2, color: "#D7E2F2" },

  divider: {
    height: 1,
    background: "rgba(255,255,255,0.08)",
    margin: "12px 0 16px",
  },

  sessionBox: {
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 12,
    background: "rgba(255, 193, 7, 0.12)",
    border: "1px solid rgba(255, 193, 7, 0.35)",
    color: "#FFE6A3",
    fontSize: 13,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  sessionBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.25)",
    color: "#FFE6A3",
    padding: "4px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
  },

  form: { display: "grid" },
  label: { fontSize: 12, opacity: 0.85, marginBottom: 6, color: "#D7E2F2" },

  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    outline: "none",
    background: "rgba(10, 12, 16, 0.6)",
    color: "#EAF1FF",
    fontSize: 14,
  },

  error: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255, 61, 87, 0.12)",
    border: "1px solid rgba(255, 61, 87, 0.25)",
    color: "#FFB4C0",
    fontSize: 12,
  },

  btn: {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(13,110,253,0.35)",
    background:
      "linear-gradient(180deg, rgba(13,110,253,0.95), rgba(13,110,253,0.78))",
    color: "#F3F8FF",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(13,110,253,0.22)",
  },
};