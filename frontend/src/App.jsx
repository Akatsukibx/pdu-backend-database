// frontend/src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import NodeView from './components/NodeView';
import RoomView from './components/RoomView';
import DashboardView from './components/DashboardView';
import LoginView from './components/LoginView';
import { fetchPDUList } from './api/pduService';

const REFRESH_MS = 60000; // 1 นาที
const CLOCK_MS = 1000;

// ✅ backend base
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// ✅ heartbeat ping ให้ last_seen ขยับ
const HEARTBEAT_MS = 60000; // 1 นาที

const TH_DATETIME_FMT = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false, // ✅ 24 ชั่วโมง
});

// ใช้ deviceId จำกัดจำนวนอุปกรณ์
function getDeviceId() {
  const key = 'pdu_device_id';
  let v = localStorage.getItem(key);
  if (!v) {
    v = (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(key, v);
  }
  return v;
}

const App = () => {
  // ---------------- AUTH ----------------
  const [isAuthed, setIsAuthed] = useState(() => !!localStorage.getItem('pdu_token'));
  const [loginError, setLoginError] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');

  // ---------------- MAIN ----------------
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedPDUId, setSelectedPDUId] = useState(null);
  const [pduList, setPduList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const isFetchingListRef = useRef(false);

  // ---------------- LOGIN ----------------
  const handleLogin = useCallback(async ({ username, password }) => {
    setLoginError('');
    setSessionMessage('');

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, deviceId: getDeviceId() }),
    });

    if (!res.ok) {
      const msg = await safeReadError(res);
      throw new Error(msg || 'Login failed');
    }

    const data = await res.json();
    const token = data?.token;
    if (!token) throw new Error('Missing token');

    localStorage.setItem('pdu_token', token);
    setIsAuthed(true);

    setSelectedNode(null);
    setSelectedPDUId(null);
    setMobileMenuOpen(false);
    setPduList([]);
    setLoaded(false);
  }, []);

  // ---------------- LOGOUT ----------------
  const logout = useCallback(async () => {
    const token = localStorage.getItem('pdu_token');
    try {
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) {
      console.warn('logout failed:', e);
    } finally {
      localStorage.removeItem('pdu_token');
      setIsAuthed(false);
      setLoginError('');
      setSessionMessage('');
      setSelectedNode(null);
      setSelectedPDUId(null);
      setMobileMenuOpen(false);
      setPduList([]);
      setLoaded(false);
    }
  }, []);

  // ---------------- HEARTBEAT (สำคัญ) ----------------
  // ✅ ถ้า user เปิดค้างไว้เฉย ๆ ให้ ping ทุก 1 นาที เพื่ออัปเดต last_seen
  useEffect(() => {
    if (!isAuthed) return;

    const t = setInterval(async () => {
      const token = localStorage.getItem('pdu_token');
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE}/api/auth/ping`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // ถ้า session หลุดจริง ให้เด้งออก
        if (!res.ok) {
          const msg = await safeReadError(res);
          const lower = String(msg || '').toLowerCase();

          if (res.status === 401 || lower.includes('unauthorized') || lower.includes('session')) {
            localStorage.removeItem('pdu_token');
            setSessionMessage('⏰ Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
            setIsAuthed(false);
          }
        }
      } catch {
        // เน็ตหลุดชั่วคราว ไม่ต้องเด้งทันที
      }
    }, HEARTBEAT_MS);

    return () => clearInterval(t);
  }, [isAuthed]);

  // ---------------- LOAD LIST ----------------
  const loadList = useCallback(async (isFirstLoad = false) => {
    if (!isAuthed) return;
    if (isFetchingListRef.current) return;
    if (!isFirstLoad && document.hidden) return;

    isFetchingListRef.current = true;
    try {
      const list = await fetchPDUList();
      setPduList(list);
    } catch (error) {
  console.error('Failed to load PDU list', error);

  const status = error?.status;
  const msg = String(error?.message || '').toLowerCase();

  if (status === 401 || msg.includes('unauthorized') || msg.includes('session')) {
    localStorage.removeItem('pdu_token');
    setSessionMessage('⏰ Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    setIsAuthed(false);
  }
    } 
    finally {
      isFetchingListRef.current = false;
      if (isFirstLoad) setLoaded(true);
    }
  }, [isAuthed]);

  // polling
  useEffect(() => {
    if (!isAuthed) return;
    loadList(true);
    const t = setInterval(() => loadList(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [isAuthed, loadList]);

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => clearInterval(t);
  }, []);

  const derivedPDUName = pduList.find(p => Number(p.id) === Number(selectedPDUId))?.name;

  // ---------------- LOGIN VIEW ----------------
  if (!isAuthed) {
    return (
      <LoginView
        onLogin={async (cred) => {
          try {
            await handleLogin(cred);
          } catch (e) {
            setLoginError(e?.message || 'Login failed');
          }
        }}
        errorMessage={loginError}
        sessionMessage={sessionMessage}
        onCloseSessionMessage={() => setSessionMessage('')}
      />
    );
  }

  // ---------------- MAIN UI ----------------
  return (
    <>
      {/* overlay menu (ถ้ามี) */}
      {mobileMenuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 900 }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        activeNode={selectedNode}
        onSelectNode={(loc) => { setSelectedNode(loc); setSelectedPDUId(null); setMobileMenuOpen(false); }}
        pduList={pduList}
        loaded={loaded}
        isOpen={mobileMenuOpen}
      />

      <main className="main-content">
        <div className="top-bar">
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>☰</button>

          <div className="clock">
            {TH_DATETIME_FMT.format(now)}
          </div>

          <button onClick={logout} style={btnStyle}>Logout</button>
        </div>

        <div className="content-scroll">
          {!selectedNode && !selectedPDUId && (
            <DashboardView
              pduList={pduList}
              onSelectDevice={(p) => {
                if (p.location) setSelectedNode(p.location);
                setSelectedPDUId(p.id);
              }}
            />
          )}

          {selectedNode && !selectedPDUId && (
            <NodeView
              location={selectedNode}
              pduList={pduList}
              onSelectPDU={setSelectedPDUId}
            />
          )}

          {selectedPDUId && (
            <RoomView
              pduId={selectedPDUId}
              pduName={derivedPDUName}
            />
          )}
        </div>
      </main>
    </>
  );
};

export default App;

// ---------------- styles ----------------
const btnStyle = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
};

// ---------------- helper ----------------
async function safeReadError(res) {
  try {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await res.json();
      return j?.error || j?.message || '';
    }
    return await res.text();
  } catch {
    return '';
  }
}