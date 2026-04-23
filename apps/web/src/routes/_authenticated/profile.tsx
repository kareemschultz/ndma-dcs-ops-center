import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, User, KeyRound, Calendar, Briefcase, Phone, HeartHandshake, AlertCircle } from "lucide-react";
import { z } from "zod";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ndma-dcs-staff-portal/ui/components/card";
import { Avatar, AvatarFallback } from "@ndma-dcs-staff-portal/ui/components/avatar";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function labelCase(s: string) {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type EmergencyContactForm = {
  name: string;
  phone: string;
  relation: string;
};

const selfServiceSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .max(32, "Phone number is too long")
    .optional()
    .or(z.literal("")),
  emergencyContacts: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Contact name is required"),
        phone: z.string().trim().min(1, "Contact phone is required"),
        relation: z.string().trim().optional().or(z.literal("")),
      }),
    )
    .max(5, "You can save up to 5 emergency contacts"),
});

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

const WORK_STATUS_COLORS: Record<string, string> = {
  backlog: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  todo: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  review: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cancelled: "bg-muted text-muted-foreground",
};

function ProfilePage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const user = session?.user;

  const { data: ownStaff } = useQuery(orpc.staff.me.queryOptions());
  const staffProfileId = ownStaff?.id;

  // Own leave requests (most recent)
  const { data: leaveRequests, isLoading: leaveLoading } = useQuery({
    ...orpc.leave.requests.list.queryOptions({
      input: { staffProfileId, limit: 8 },
    }),
    enabled: !!staffProfileId,
  });

  // Own open work items (assigned to me, not done/cancelled)
  const { data: workItems, isLoading: workLoading } = useQuery({
    ...orpc.work.list.queryOptions({
      input: { assignedToId: staffProfileId, limit: 10 },
    }),
    enabled: !!staffProfileId,
  });

  // â”€â”€ Profile name update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [name, setName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setNameLoading(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setNameLoading(false);
    if (error) {
      toast.error(error.message ?? "Failed to update name");
    } else {
      toast.success("Name updated successfully");
    }
  }

  // â”€â”€ Password change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPw.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPwLoading(true);
    const { error } = await (authClient as unknown as {
      changePassword: (p: {
        currentPassword: string;
        newPassword: string;
        revokeOtherSessions: boolean;
      }) => Promise<{ error?: { message?: string } }>;
    }).changePassword({
      currentPassword: currentPw,
      newPassword: newPw,
      revokeOtherSessions: false,
    });
    setPwLoading(false);
    if (error) {
      toast.error(error.message ?? "Failed to change password");
    } else {
      toast.success("Password updated successfully");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }

  const [phoneNumber, setPhoneNumber] = useState("");
  const [contacts, setContacts] = useState<EmergencyContactForm[]>([
    { name: "", phone: "", relation: "" },
  ]);
  const [contactSaving, setContactSaving] = useState(false);

  useEffect(() => {
    if (!ownStaff) return;
    setPhoneNumber(ownStaff.phoneNumber ?? "");
    const nextContacts = (ownStaff.emergencyContacts ?? []).map((contact) => ({
      name: contact.name ?? "",
      phone: contact.phone ?? "",
      relation: contact.relation ?? "",
    }));
    setContacts(nextContacts.length > 0 ? nextContacts : [{ name: "", phone: "", relation: "" }]);
  }, [ownStaff]);

  const updateSelfMutation = useMutation(
    orpc.staff.updateSelf.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpc.staff.me.key() });
        const previous = queryClient.getQueryData<NonNullable<typeof ownStaff>>(
          orpc.staff.me.key(),
        );
        queryClient.setQueryData<NonNullable<typeof ownStaff>>(
          orpc.staff.me.key(),
          (current) => {
            if (!current) return current;
            return {
              ...current,
              phoneNumber: input.phoneNumber ?? current.phoneNumber,
              emergencyContacts: input.emergencyContacts ?? current.emergencyContacts,
            };
          },
        );
        return { previous };
      },
      onError: (err: Error, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(orpc.staff.me.key(), context.previous);
        }
        toast.error(err.message ?? "Failed to update contact details");
      },
      onSuccess: async () => {
        toast.success("Contact details updated successfully");
        await queryClient.invalidateQueries({ queryKey: orpc.staff.me.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.staff.list.key() });
      },
    }),
  );

  function addContactRow() {
    setContacts((current) => [...current, { name: "", phone: "", relation: "" }]);
  }

  function removeContactRow(index: number) {
    setContacts((current) => {
      if (current.length <= 1) return [{ name: "", phone: "", relation: "" }];
      return current.filter((_, i) => i !== index);
    });
  }

  async function handleUpdateSelfContacts(e: React.FormEvent) {
    e.preventDefault();

    const normalizedContacts = contacts
      .map((contact) => ({
        name: contact.name.trim(),
        phone: contact.phone.trim(),
        relation: contact.relation.trim(),
      }))
      .filter((contact) => contact.name || contact.phone || contact.relation);

    const parsed = selfServiceSchema.safeParse({
      phoneNumber: phoneNumber.trim(),
      emergencyContacts: normalizedContacts,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the contact fields");
      return;
    }

    setContactSaving(true);
    try {
      await updateSelfMutation.mutateAsync({
        phoneNumber: parsed.data.phoneNumber || undefined,
        emergencyContacts: parsed.data.emergencyContacts,
      });
    } finally {
      setContactSaving(false);
    }
  }

  const userRole = (user as Record<string, unknown> | undefined)?.role as string | undefined;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">My Profile</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account details and view your activity.
          </p>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* â”€â”€ Account info + name edit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="size-4 text-blue-500" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Avatar row */}
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  <AvatarFallback className="text-xl rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    {getInitials(user?.name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-semibold">{user?.name ?? "â€”"}</p>
                  <p className="text-sm text-muted-foreground">{user?.email ?? "â€”"}</p>
                  {(ownStaff || userRole) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {userRole && (
                        <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          {labelCase(userRole)}
                        </span>
                      )}
                      {ownStaff?.department?.name && (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {ownStaff.department.name}
                        </span>
                      )}
                      {ownStaff?.employmentType && (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {labelCase(ownStaff.employmentType)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Edit name */}
              <form onSubmit={handleUpdateName} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name">Display Name</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email Address</Label>
                  <Input
                    value={user?.email ?? ""}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Contact an administrator to change your email address.
                  </p>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={nameLoading || !name.trim() || name.trim() === user?.name}
                >
                  {nameLoading ? "Savingâ€¦" : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {ownStaff && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HeartHandshake className="size-4 text-green-500" />
                  Self-Service Contact Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateSelfContacts} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="self-phone">Phone Number</Label>
                    <Input
                      id="self-phone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+592 000-0000"
                    />
                    <p className="text-xs text-muted-foreground">
                      This number is visible in the directory and used for internal contact.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium">Emergency Contacts</Label>
                        <p className="text-xs text-muted-foreground">
                          Add the people NDMA should contact if an urgent issue occurs.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addContactRow}>
                        <Plus className="size-3.5 mr-1" />
                        Add Contact
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {contacts.map((contact, index) => (
                        <div key={`${index}-${contact.name}-${contact.phone}`} className="rounded-xl border p-3 space-y-3">
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-1.5">
                              <Label>Name</Label>
                              <Input
                                value={contact.name}
                                onChange={(e) =>
                                  setContacts((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, name: e.target.value } : row,
                                    ),
                                  )
                                }
                                placeholder="Emergency contact name"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Phone</Label>
                              <Input
                                value={contact.phone}
                                onChange={(e) =>
                                  setContacts((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, phone: e.target.value } : row,
                                    ),
                                  )
                                }
                                placeholder="+592 000-0000"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Relation</Label>
                              <select
                                value={contact.relation}
                                onChange={(e) =>
                                  setContacts((current) =>
                                    current.map((row, i) =>
                                      i === index ? { ...row, relation: e.target.value } : row,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">Select relation</option>
                                <option value="Spouse">Spouse</option>
                                <option value="Parent">Parent</option>
                                <option value="Sibling">Sibling</option>
                                <option value="Child">Child</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeContactRow(index)}
                            >
                              <Trash2 className="size-3.5 mr-1.5" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button type="submit" size="sm" disabled={contactSaving || updateSelfMutation.isPending}>
                      {contactSaving || updateSelfMutation.isPending ? "Saving…" : "Save Contact Details"}
                    </Button>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AlertCircle className="size-3.5" />
                      Only you can change these fields.
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* â”€â”€ Change password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="size-4 text-amber-500" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="current-pw">Current Password</Label>
                  <Input
                    id="current-pw"
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-pw">New Password</Label>
                  <Input
                    id="new-pw"
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pw">Confirm New Password</Label>
                  <Input
                    id="confirm-pw"
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                >
                  {pwLoading ? "Updatingâ€¦" : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* â”€â”€ My leave requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="size-4 text-green-500" />
                  My Leave Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaveLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !leaveRequests?.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No leave requests on record.
                  </p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {leaveRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between px-3 py-2.5 gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {req.leaveType?.name ?? "Leave"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(req.startDate), "dd MMM")} â€“{" "}
                            {format(parseISO(req.endDate), "dd MMM yyyy")}
                            {" Â· "}
                            {req.totalDays} day{req.totalDays !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 ${
                            LEAVE_STATUS_COLORS[req.status] ?? ""
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* â”€â”€ My work items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="size-4 text-indigo-500" />
                  My Work Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                {workLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !workItems?.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No work items assigned to you.
                  </p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {workItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-3 py-2.5 gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {item.type?.replace(/_/g, " ")}
                            {item.dueDate
                              ? ` Â· Due ${format(parseISO(item.dueDate), "dd MMM")}`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 ${
                            WORK_STATUS_COLORS[item.status] ?? ""
                          }`}
                        >
                          {labelCase(item.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </Main>
    </>
  );
}






