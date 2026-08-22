// Small inline line-icons for the sidebar nav - not a dependency (matches
// this project's existing zero-UI-framework approach), just enough visual
// weight to tell nav items apart at a glance, especially in collapsed
// icon-only mode. Consistent 20x20 viewBox, 1.8 stroke.
const common = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function DashboardIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="2.5" y="2.5" width="7" height="6" rx="1.3" />
      <rect x="11.5" y="2.5" width="6" height="4" rx="1.3" />
      <rect x="11.5" y="8.5" width="6" height="9" rx="1.3" />
      <rect x="2.5" y="10.5" width="7" height="7" rx="1.3" />
    </svg>
  );
}

export function LeadsIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="7.5" cy="6.5" r="3" />
      <path d="M2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15 5v6M12 8h6" />
    </svg>
  );
}

export function PipelineIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M2.5 3h15l-5.5 6.5V16l-4 1.5v-8z" />
    </svg>
  );
}

export function CompaniesIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3" y="2.5" width="8.5" height="15" rx="1" />
      <path d="M11.5 8h5.5v10h-5.5" />
      <path d="M5.5 6h1.5M5.5 9h1.5M5.5 12h1.5M5.5 15h1.5" />
      <path d="M13.8 11h1M13.8 14h1" />
    </svg>
  );
}

export function ContactsIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.6" />
      <circle cx="7.7" cy="8.6" r="2" />
      <path d="M4.7 13.5c0-1.7 1.4-2.7 3-2.7s3 1 3 2.7" />
      <path d="M12.5 8h2.8M12.5 11h2.8" />
    </svg>
  );
}

export function TasksIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2.2" />
      <path d="M6.5 10.3l2.2 2.2 4.8-5" />
    </svg>
  );
}

export function ProjectsIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M2.5 5.3a1.3 1.3 0 011.3-1.3H8l1.6 2h6.6a1.3 1.3 0 011.3 1.3v8.4a1.3 1.3 0 01-1.3 1.3H3.8a1.3 1.3 0 01-1.3-1.3z" />
      <path d="M6 13.5v-3M10 13.5v-5M14 13.5v-2" />
    </svg>
  );
}

export function ChatIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M2.5 4.8a1.8 1.8 0 011.8-1.8h11.4a1.8 1.8 0 011.8 1.8v6.9a1.8 1.8 0 01-1.8 1.8H8l-3.8 3.2v-3.2H4.3a1.8 1.8 0 01-1.8-1.8z" />
      <path d="M6 7.3h8M6 10h5" />
    </svg>
  );
}

export function BoardsIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12.3 2.9l4.3 4.3-9 9-4.8 1 1-4.8z" />
      <path d="M11 4.2l4.3 4.3" />
    </svg>
  );
}

export function AutomationIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M11 2.3L4 11.5h5.2L9 17.7l7-9.2h-5.2z" />
    </svg>
  );
}

export function TeamIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="7" cy="6.3" r="2.8" />
      <path d="M2 16c0-2.7 2.2-4.5 5-4.5s5 1.8 5 4.5" />
      <circle cx="14.3" cy="7.3" r="2.1" />
      <path d="M13 11.4c2 .1 4 1.4 4 4.1" />
    </svg>
  );
}

export function CollapseIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="2.5" y="3" width="15" height="14" rx="2" />
      <path d="M8 3v14" />
      <path d="M5.3 8l-1.6 2 1.6 2" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M8 17.5H4.3a1.3 1.3 0 01-1.3-1.3V3.8a1.3 1.3 0 011.3-1.3H8" />
      <path d="M12.5 13.5L17 10l-4.5-3.5" />
      <path d="M17 10H7.3" />
    </svg>
  );
}
