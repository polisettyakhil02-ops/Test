import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { NAV_ITEMS } from "@/components/layout/nav.config";

export function DashboardHome() {
  const { user, hasRole } = useAuth();
  const quickLinks = NAV_ITEMS.filter((item) => item.path !== "/" && hasRole(...item.roles));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          Welcome{user?.fullName ? `, ${user.fullName}` : ""}
        </h1>
        <p className="text-sm text-slate-500">Pick up where you left off.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((item) => (
          <Link key={item.path} to={item.path}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <span aria-hidden="true">{item.icon}</span>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500">Go to {item.label.toLowerCase()}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
