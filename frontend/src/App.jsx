import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NodeView from './components/NodeView';
import RoomView from './components/RoomView';
import DashboardView from './components/DashboardView';
import { fetchPDUList } from './api/pduService';

const App = () => {
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedPDUId, setSelectedPDUId] = useState(null);
    const [pduList, setPduList] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Fetch basic list on mount
    useEffect(() => {
        const loadList = async () => {
            try {
                const list = await fetchPDUList();
                setPduList(list);
            } catch (error) {
                console.error("Failed to load PDU list", error);
            } finally {
                setLoaded(true);
            }
        };
        loadList();
    }, []);

    const handleNodeClick = (location) => {
        setSelectedNode(location);
        setSelectedPDUId(null);
        setMobileMenuOpen(false); // Close menu on selection
    };

    const derivedPDUName = pduList.find(p => Number(p.id) === Number(selectedPDUId))?.name;

    return (
        <>
            {/* Overlay for mobile when menu is open */}
            {mobileMenuOpen && (
                <div
                    style={{
                        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 900
                    }}
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            <Sidebar
                activeNode={selectedNode}
                onSelectNode={handleNodeClick}
                pduList={pduList}
                loaded={loaded}
                isOpen={mobileMenuOpen} // Pass open state to sidebar
            />

            <main className="main-content">
                <div className="top-bar">
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setMobileMenuOpen(true)}
                    >
                        ☰
                    </button>

                    <div className="breadcrumb">
                        <span className="crumb">SYS</span>

                        {selectedNode && (
                            <React.Fragment>
                                <span className="crumb-sep">/</span>
                                <span
                                    className={`crumb ${!selectedPDUId ? 'active' : ''}`}
                                    onClick={() => setSelectedPDUId(null)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {selectedNode.toUpperCase()}
                                </span>
                            </React.Fragment>
                        )}

                        {selectedPDUId && (
                            <React.Fragment>
                                <span className="crumb-sep">/</span>
                                <span className="crumb active">{derivedPDUName}</span>
                            </React.Fragment>
                        )}
                    </div>
                    <div className="clock">
                        {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>

                <div className="content-scroll">
                    {/* แสดง Dashboard เมื่อไม่ได้เลือก Zone และไม่ได้เลือก PDU รายตัว */}
                    {!selectedNode && !selectedPDUId && (
                        <DashboardView pduList={pduList} />
                    )}

                    {/* แสดงรายชื่อ PDU ในโซนที่เลือก */}
                    {selectedNode && !selectedPDUId && (
                        <NodeView
                            location={selectedNode}
                            pduList={pduList}
                            onSelectPDU={setSelectedPDUId}
                        />
                    )}

                    {/* แสดงหน้า Monitoring รายเครื่อง */}
                    {selectedPDUId && (
                        <RoomView
                            pduId={selectedPDUId}
                            onBack={() => setSelectedPDUId(null)}
                        />
                    )}
                </div>
            </main>
        </>
    );
};

export default App;
