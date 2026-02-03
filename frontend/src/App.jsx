// App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import NodeView from './components/NodeView';
import RoomView from './components/RoomView';
import DashboardView from './components/DashboardView';
import { fetchPDUList } from './api/pduService';

const REFRESH_MS = 300000; // ✅ ดึงข้อมูลใหม่ทุก 5 นาที
const CLOCK_MS = 1000;   // ✅ ให้ clock เดินจริง

const App = () => {
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedPDUId, setSelectedPDUId] = useState(null);
    const [pduList, setPduList] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // ✅ Clock state (ถ้าไม่ทำ state เวลาจะค้าง เพราะ React ไม่ re-render เอง)
    const [now, setNow] = useState(() => new Date());

    // ✅ กันยิงซ้อน (กรณี API ตอบช้าแล้ว interval ยิงซ้ำ)
    const isFetchingListRef = useRef(false);

    const loadList = useCallback(async (isFirstLoad = false) => {
        // กันยิงซ้อน
        if (isFetchingListRef.current) return;

        // กันยิงตอน tab ไม่ได้ active (ลดภาระ backend)
        if (!isFirstLoad && document.hidden) return;

        isFetchingListRef.current = true;
        try {
            const list = await fetchPDUList();
            setPduList(list);
        } catch (error) {
            console.error("Failed to load PDU list", error);
        } finally {
            isFetchingListRef.current = false;
            if (isFirstLoad) setLoaded(true);
        }
    }, []);

    // ✅ Fetch basic list on mount + polling
    useEffect(() => {
        loadList(true); // โหลดครั้งแรก

        const interval = setInterval(() => {
            loadList(false); // โหลดซ้ำ
        }, REFRESH_MS);

        return () => clearInterval(interval);
    }, [loadList]);

    // ✅ clock ticking
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), CLOCK_MS);
        return () => clearInterval(t);
    }, []);

    const handleNodeClick = (location) => {
        setSelectedNode(location);
        setSelectedPDUId(null);
        setMobileMenuOpen(false); // Close menu on selection
    };

    const derivedPDUName = pduList.find(p => Number(p.id) === Number(selectedPDUId))?.name;

    return (
        <>
            {/* 1. Mobile Overlay */}
            {mobileMenuOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 900 }}
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* 2. Sidebar */}
            <Sidebar
                activeNode={selectedNode}
                onSelectNode={handleNodeClick}
                pduList={pduList}
                loaded={loaded}
                isOpen={mobileMenuOpen}
            />

            <main className="main-content">
                {/* 3. Top Bar (Breadcrumb & Clock) */}
                <div className="top-bar">
                    <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>☰</button>

                    <div className="breadcrumb">
                        <span
                            className="crumb"
                            onClick={() => { setSelectedNode(null); setSelectedPDUId(null); }}
                            style={{ cursor: 'pointer' }}
                        >
                            SYS
                        </span>

                        {selectedNode && (
                            <>
                                <span className="crumb-sep">/</span>
                                <span
                                    className={`crumb ${!selectedPDUId ? 'active' : ''}`}
                                    onClick={() => setSelectedPDUId(null)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {selectedNode.toUpperCase()}
                                </span>
                            </>
                        )}

                        {selectedPDUId && (
                            <>
                                <span className="crumb-sep">/</span>
                                <span className="crumb active">{derivedPDUName}</span>
                            </>
                        )}
                    </div>

                    <div className="clock">
                        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>

                {/* 4. Main Content Area */}
                <div className="content-scroll">
                    {/* เงื่อนไขที่ 1: หน้าแรกสุด (Dashboard) */}
                    {!selectedNode && !selectedPDUId && (
                        <DashboardView pduList={pduList} />
                    )}

                    {/* เงื่อนไขที่ 2: เลือกโซนแล้ว แต่ยังไม่ได้เลือกเครื่อง (Node View) */}
                    {selectedNode && !selectedPDUId && (
                        <NodeView
                            location={selectedNode}
                            pduList={pduList}
                            onSelectPDU={setSelectedPDUId}
                        />
                    )}

                    {/* เงื่อนไขที่ 3: เลือกเครื่องแล้ว (Room View) */}
                    {selectedPDUId && (
                        <RoomView
                            pduId={selectedPDUId}
                            pduName={derivedPDUName}
                            onBack={() => setSelectedPDUId(null)}
                        />
                    )}
                </div>
            </main>
        </>
    );
};

export default App;