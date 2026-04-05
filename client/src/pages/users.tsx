import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getUsers, createUser } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Shield, Building2, Clock, Mail } from "lucide-react";

const ROLES = [
  { value: "admin", label: "Admin", color: "destructive", desc: "Full system access" },
  { value: "analyst", label: "Analyst", color: "info", desc: "View and analyze data" },
  { value: "field_tech", label: "Field Tech", color: "success", desc: "Collect samples, execute campaigns" },
  { value: "viewer", label: "Viewer", color: "secondary", desc: "Read-only access" },
];

export default function UsersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: getUsers });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setShowForm(false); },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name"), email: fd.get("email"),
      role: fd.get("role"), password: fd.get("password"),
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader title="User Management" description="SwissSoil platform users — assign team members to farms and manage access"
        action={<Button onClick={() => setShowForm(!showForm)} size="sm"><UserPlus className="w-4 h-4" /> {showForm ? "Cancel" : "New User"}</Button>} />

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-xl p-5 bg-white space-y-4">
          <h3 className="text-sm font-semibold">Create User</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Full Name *</label><Input name="name" required className="mt-1" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Email *</label><Input name="email" type="email" required className="mt-1" placeholder="user@swisssoil.com" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Role *</label>
              <select name="role" required className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Password *</label><Input name="password" type="password" required className="mt-1" placeholder="Min 8 characters" /></div>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create User"}</Button>
          {createMutation.isError && <p className="text-xs text-red-600">{(createMutation.error as Error).message}</p>}
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      <div className="border rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-5 py-3 text-left font-medium">User</th>
              <th className="px-5 py-3 text-left font-medium">Role</th>
              <th className="px-5 py-3 text-center font-medium">Farms</th>
              <th className="px-5 py-3 text-left font-medium">Last Login</th>
              <th className="px-5 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users?.map((u: any) => {
              const roleConfig = ROLES.find(r => r.value === u.role);
              return (
                <tr key={u.id} className="hover:bg-muted/20">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                        {u.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={roleConfig?.color as any || "secondary"}>
                      <Shield className="w-3 h-3 mr-1" /> {roleConfig?.label || u.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Building2 className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{u.farm_count}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {u.last_login_at ? (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(u.last_login_at).toLocaleDateString()}
                      </span>
                    ) : "Never"}
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
