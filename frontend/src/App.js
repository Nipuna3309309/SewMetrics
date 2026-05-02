import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview           from './pages/Overview';
import StitchMonitoring   from './pages/StitchMonitoring';
import RPMMonitoring      from './pages/RPMMonitoring';
import TemperatureMonitoring from './pages/TemperatureMonitoring';
import VibrationMonitoring   from './pages/VibrationMonitoring';
import MaintenanceAlerts     from './pages/MaintenanceAlerts';
import Analytics             from './pages/Analytics';
import HistoricalData        from './pages/HistoricalData';
import './styles/global.css';

// ─── Single machine in the system ────────────────────────────────────────────
export const MACHINE_ID = 'SM_01';
export const MACHINE_LABEL = 'Sewing Machine 01';

export default function App() {
  return (
    <Router>
      <div className="app-shell">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview"     element={<Overview />} />
            <Route path="/stitch"       element={<StitchMonitoring />} />
            <Route path="/rpm"          element={<RPMMonitoring />} />
            <Route path="/temperature"  element={<TemperatureMonitoring />} />
            <Route path="/vibration"    element={<VibrationMonitoring />} />
            <Route path="/maintenance"  element={<MaintenanceAlerts />} />
            <Route path="/analytics"    element={<Analytics />} />
            <Route path="/history"      element={<HistoricalData />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
