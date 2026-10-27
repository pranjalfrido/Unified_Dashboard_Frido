// Laptop Profile page style tokens (moved unchanged from ProfilePage.jsx so the add-member form can be shared).
// ── Style tokens ──────────────────────────────────────────────────────────────
export const S = {
  page: {
    fontFamily: 'Inter, system-ui, sans-serif',
    padding: '28px 28px 48px',
    maxWidth: 1100,
    margin: '0 auto',
    color: '#1E2321',
    background: '#F7F5EF',
    minHeight: '100%',
  },
  pageHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 28, flexWrap: 'wrap', gap: 14,
  },
  card: {
    background: '#FFFFFF',
    borderRadius: 16,
    border: '1px solid #E7E3D8',
    padding: '24px 24px',
    marginBottom: 20,
    boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.12)',
  },
  cardTitle: {
    fontSize: 15, fontWeight: 800, color: '#1E2321',
    fontFamily: 'Inter, system-ui, sans-serif',
    marginBottom: 0,
  },
  label: {
    fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6,
    color: '#4B534F', textTransform: 'uppercase', letterSpacing: '.05em',
  },
  input: {
    width: '100%', padding: '10px 13px', fontSize: 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    border: '1px solid #E7E3D8', borderRadius: 9,
    background: '#F7F5EF', color: '#1E2321',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s, box-shadow .15s',
  },
  toggleBtn: {
    position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', fontSize: 11, fontWeight: 800,
    color: '#9BA5A1', cursor: 'pointer', letterSpacing: '.05em',
  },
  primaryBtn: {
    padding: '9px 18px', border: 'none', borderRadius: 8,
    background: '#3E6B4F', color: '#F7F5EF',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer', transition: 'background .15s',
  },
  outlineBtn: {
    padding: '8px 16px', border: '1.5px solid #E7E3D8', borderRadius: 8,
    background: 'transparent', color: '#1E2321',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'background .15s',
  },
  destructiveBtn: {
    padding: '9px 18px', border: '1.5px solid #B4472B', borderRadius: 8,
    background: '#B4472B', color: '#fff',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer',
  },
  smBtn: {
    padding: '6px 12px', border: '1px solid #E7E3D8', borderRadius: 8,
    background: '#fff', color: '#1E2321',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', transition: 'background .12s',
    whiteSpace: 'nowrap',
  },
  textBtn: {
    background: 'none', border: 'none', padding: 0,
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: 600,
    color: '#1E2321', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  iconBtn: {
    background: '#F7F5EF', border: 'none', borderRadius: 8,
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, cursor: 'pointer', color: '#4B534F',
  },
  chip: {
    padding: '5px 13px', border: '1px solid #E7E3D8', borderRadius: 100,
    background: '#F7F5EF', color: '#4B534F',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', transition: 'all .12s',
  },
  chipActive: {
    border: '1.5px solid #3E6B4F', background: '#E4EFE6', color: '#3E6B4F',
  },
  errBox: {
    background: '#F6E6E1', border: '1px solid #B4472B', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, color: '#B4472B', fontWeight: 600,
  },
  successBox: {
    background: '#E4EFE6', border: '1px solid #3E6B4F', borderRadius: 8,
    padding: '12px 14px', fontSize: 13, color: '#3E6B4F', fontWeight: 600,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(30,35,33,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 24,
  },
  modal: {
    background: '#fff', borderRadius: 20, padding: '28px 32px',
    width: '100%', maxWidth: 480,
    boxShadow: '0 30px 80px rgba(30,35,33,0.22)',
    maxHeight: '90vh', overflowY: 'auto',
  },
}
