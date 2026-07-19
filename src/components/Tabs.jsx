// components/Tabs.jsx
export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="tabs" role="tablist" aria-label="Seções">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className="tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
