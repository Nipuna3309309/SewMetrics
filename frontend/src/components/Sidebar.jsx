import React from 'react';
import { NavLink } from 'react-router-dom';
import { MACHINE_LABEL } from '../App';
import './Sidebar.css';

const NAV = [
  { to:'/overview',    label:'Overview',               icon:'⊞' },
  { to:'/stitch',      label:'Stitch Monitoring',      icon:'✦' },
  { to:'/rpm',         label:'RPM Monitoring',         icon:'◎' },
  { to:'/temperature', label:'Temperature Monitoring', icon:'🌡' },
  { to:'/vibration',   label:'Vibration Monitoring',   icon:'〰' },
  { to:'/maintenance', label:'Maintenance Alerts',      icon:'🔔' },
  { to:'/analytics',  label:'ML Analytics',            icon:'🧠' },
  { to:'/history',    label:'Historical Data',         icon:'📋' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="sb-icon">⚡</span>
        <span className="sb-name">SewMetrics</span>
      </div>
      <nav className="sb-nav">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to}
            className={({isActive}) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sb-footer">
        <div className="sb-machine-badge">
          <span className="ldot" />
          {MACHINE_LABEL}
        </div>
        <div className="sb-user">
          <span style={{fontSize:'1.2rem'}}>👤</span>
          <div>
            <div style={{fontWeight:600,fontSize:'.82rem'}}>Admin User</div>
            <div style={{color:'#9ca3af',fontSize:'.73rem'}}>Plant Manager</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
