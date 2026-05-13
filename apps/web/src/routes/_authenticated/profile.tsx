import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, User, KeyRound, Calendar, Briefcase, Phone, HeartHandshake, AlertCircle, Shield, BookOpen, ClipboardList, Star, Medal, Activity, Wifi, TrendingUp, CheckSquare, BarChart3 } from "lucide-react";
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
  phoneNumber: z.string().trim().max(32, "Phone number is too long").optional().or(z.literal("")),
  cugPhoneNumber: z.string().trim().max(32, "CUG phone number is too long").optional().or(z.literal("")),
  cugSimNumber: z.string().trim().max(32, "CUG SIM number is too long").optional().or(z.literal("")),
  mifiAssetTag: z.string().trim().max(64, "MiFi asset tag is too long").optional().or(z.literal("")),
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
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

const WORK_STATUS_COLORS: Record<string, string> = {
  backlog: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  todo: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  review: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  done: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
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
  const [cugPhoneNumber, setCugPhoneNumber] = useState("");
  const [cugSimNumber, setCugSimNumber] = useState("");
  const [mifiAssetTag, setMifiAssetTag] = useState("");
  const [contacts, setContacts] = useState<EmergencyContactForm[]>([
    { name: "", phone: "", relation: "" },
  ]);
  const [contactSaving, setContactSaving] = useState(false);

  useEffect(() => {
    if (!ownStaff) return;
    setPhoneNumber(ownStaff.phoneNumber ?? "");
    setCugPhoneNumber(ownStaff.cugPhoneNumber ?? "");
    setCugSimNumber(ownStaff.cugSimNumber ?? "");
    setMifiAssetTag(ownStaff.mifiAssetTag ?? "");
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
              cugPhoneNumber: input.cugPhoneNumber ?? current.cugPhoneNumber,
              cugSimNumber: input.cugSimNumber ?? current.cugSimNumber,
              mifiAssetTag: input.mifiAssetTag ?? current.mifiAssetTag,
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
      cugPhoneNumber: cugPhoneNumber.trim(),
      cugSimNumber: cugSimNumber.trim(),
      mifiAssetTag: mifiAssetTag.trim(),
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
        cugPhoneNumber: parsed.data.cugPhoneNumber || undefined,
        cugSimNumber: parsed.data.cugSimNumber || undefined,
        mifiAssetTag: parsed.data.mifiAssetTag || undefined,
        emergencyContacts: parsed.data.emergencyContacts,
      });
    } finally {
      setContactSaving(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  // Leave balances
  const { data: leaveBalances, isLoading: balancesLoading } = useQuery({
    ...orpc.leave.balances.getByStaff.queryOptions({
      input: { staffProfileId: staffProfileId ?? "" },
    }),
    enabled: !!staffProfileId,
  });

  // TOSD records (current year)
  const { data: tosdList, isLoading: tosdLoading } = useQuery({
    ...orpc.leave.tosd.list.queryOptions({
      input: { staffId: staffProfileId, year: currentYear },
    }),
    enabled: !!staffProfileId,
  });

  // Lateness records (current year)
  const { data: latenessData, isLoading: latenessLoading } = useQuery({
    ...orpc.lateness.list.queryOptions({
      input: { staffId: staffProfileId, year: currentYear },
    }),
    enabled: !!staffProfileId,
  });

  // My appraisals
  const { data: myAppraisals, isLoading: appraisalsLoading } = useQuery({
    ...orpc.appraisals.getByStaff.queryOptions({
      input: { staffProfileId: staffProfileId ?? "" },
    }),
    enabled: !!staffProfileId,
  });

  // NOC performance journal
  const { data: perfJournal, isLoading: perfJournalLoading } = useQuery({
    ...orpc.nocPerformanceJournal.list.queryOptions({
      input: { staffProfileId },
    }),
    enabled: !!staffProfileId,
  });

  // Commendations
  const { data: myCommendations, isLoading: commendationsLoading } = useQuery({
    ...orpc.commendations.list.queryOptions({
      input: { staffProfileId },
    }),
    enabled: !!staffProfileId,
  });

  // In-house training log
  const { data: inHouseLog, isLoading: inHouseLoading } = useQuery({
    ...orpc.inHouseLog.list.queryOptions({
      input: { staffId: staffProfileId },
    }),
    enabled: !!staffProfileId,
  });

  // Exam vouchers assigned to me
  const { data: myVouchers, isLoading: vouchersLoading } = useQuery({
    ...orpc.examVouchers.list.queryOptions({
      input: { assignedStaffId: staffProfileId },
    }),
    enabled: !!staffProfileId,
  });

  // PPE issuances
  const { data: myPpe, isLoading: ppeLoading } = useQuery({
    ...orpc.ppe.issuances.list.queryOptions({
      input: { staffProfileId },
    }),
    enabled: !!staffProfileId,
  });

  // Access registry
  const { data: myAccess, isLoading: accessLoading } = useQuery({
    ...orpc.accessRegistry.listByStaff.queryOptions({
      input: { staffId: staffProfileId ?? "" },
    }),
    enabled: !!staffProfileId,
  });

  // Career progression plans
  const { data: careerPlans, isLoading: careerLoading } = useQuery({
    ...orpc.careerProgression.list.queryOptions({
      input: { staffId: staffProfileId },
    }),
    enabled: !!staffProfileId,
  });

  // Onboarding tasks
  const { data: onboardingTaskList, isLoading: onboardingLoading } = useQuery({
    ...orpc.onboarding.tasksList.queryOptions({
      input: { staffId: staffProfileId ?? "" },
    }),
    enabled: !!staffProfileId,
  });

  // NOC shifts (current + next month)
  const { data: shiftsThisMonth, isLoading: shiftsLoading } = useQuery({
    ...orpc.scheduling.nocShifts.list.queryOptions({
      input: { month: currentMonth, year: currentYear },
    }),
    enabled: !!staffProfileId,
    select: (data) => data.filter((s) => s.staffId === staffProfileId),
  });
  const { data: shiftsNextMonth } = useQuery({
    ...orpc.scheduling.nocShifts.list.queryOptions({
      input: { month: nextMonth, year: nextMonthYear },
    }),
    enabled: !!staffProfileId,
    select: (data) => data.filter((s) => s.staffId === staffProfileId),
  });

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
                  <HeartHandshake className="size-4 text-blue-500" />
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

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="self-cug-phone">CUG Phone</Label>
                      <Input
                        id="self-cug-phone"
                        value={cugPhoneNumber}
                        onChange={(e) => setCugPhoneNumber(e.target.value)}
                        placeholder="+592 000-0000"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="self-cug-sim">CUG SIM Number</Label>
                      <Input
                        id="self-cug-sim"
                        value={cugSimNumber}
                        onChange={(e) => setCugSimNumber(e.target.value)}
                        placeholder="SIM identifier"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="self-mifi">MiFi Asset Tag</Label>
                      <Input
                        id="self-mifi"
                        value={mifiAssetTag}
                        onChange={(e) => setMifiAssetTag(e.target.value)}
                        placeholder="e.g. NDMA-MIFI-2300"
                      />
                    </div>
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
                  <Calendar className="size-4 text-blue-500" />
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
          {/* ── My Leave Balances ─────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="size-4 text-teal-500" />
                  My Leave Balances
                </CardTitle>
              </CardHeader>
              <CardContent>
                {balancesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !leaveBalances?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No leave balances on record.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {leaveBalances.map((bal) => (
                      <div key={bal.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <span className="text-sm font-medium">{(bal as unknown as { leaveType?: { name?: string } }).leaveType?.name ?? "Leave"}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Entitlement: <span className="font-semibold text-foreground">{bal.entitlement}</span></span>
                          <span>Used: <span className="font-semibold text-foreground">{bal.used ?? 0}</span></span>
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">
                            Balance: {(bal.entitlement ?? 0) + (bal.adjustment ?? 0) + (bal.carriedOver ?? 0) - (bal.used ?? 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My TOSD Records ───────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="size-4 text-orange-500" />
                  My TOSD Records ({currentYear})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tosdLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !tosdList?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No TOSD records for {currentYear}.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {tosdList.slice(0, 10).map((rec) => (
                      <div key={rec.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">{rec.type.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{rec.date}</p>
                        </div>
                        {rec.hours != null && (
                          <span className="text-xs text-muted-foreground shrink-0">{rec.hours}h</span>
                        )}
                      </div>
                    ))}
                    {(tosdList.length ?? 0) > 10 && (
                      <div className="px-3 py-2 text-center text-xs text-muted-foreground">
                        +{tosdList.length - 10} more records
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Lateness History ───────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="size-4 text-red-500" />
                  My Lateness History ({currentYear})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latenessLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !latenessData?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No lateness records for {currentYear}.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {latenessData.map((rec) => (
                      <div key={rec.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <span className="text-sm font-medium">{rec.month}, Q{rec.quarter}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {rec.daysLate != null && <span>Days late: <span className="font-semibold text-foreground">{rec.daysLate}</span></span>}
                          {rec.totalTimeLate != null && <span>Total time: <span className="font-semibold text-foreground">{rec.totalTimeLate}</span></span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Appraisals ─────────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="size-4 text-blue-500" />
                  My Appraisals
                </CardTitle>
              </CardHeader>
              <CardContent>
                {appraisalsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !myAppraisals?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No appraisals on record.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {myAppraisals.map((apr) => (
                      <div key={apr.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">{apr.period?.replace(/_/g, " ") ?? "Appraisal"}</p>
                          <p className="text-xs text-muted-foreground">
                            {apr.periodStart ? format(parseISO(String(apr.periodStart)), "MMM yyyy") : ""}
                            {apr.periodEnd ? ` – ${format(parseISO(String(apr.periodEnd)), "MMM yyyy")}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {apr.percentageScore != null && (
                            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{apr.percentageScore.toFixed(1)}%</span>
                          )}
                          <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            apr.status === "completed" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                            apr.status === "approved" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {labelCase(apr.status ?? "")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Commendations ──────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Medal className="size-4 text-yellow-500" />
                  My Commendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commendationsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !myCommendations?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No commendations on record.</p>
                ) : (
                  <div className="space-y-3">
                    {myCommendations.slice(0, 6).map((com) => (
                      <div key={com.id} className="rounded-xl border p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                            {new Date(0, com.month - 1).toLocaleString("en", { month: "long" })} {com.year}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{com.narrative}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Performance Journal ────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="size-4 text-purple-500" />
                  My Performance Journal (NOC)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {perfJournalLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !perfJournal?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No performance journal entries.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {perfJournal.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">{entry.category.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{new Date(0, entry.month - 1).toLocaleString("en", { month: "short" })} {entry.year}</p>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">Count: {entry.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Training ───────────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="size-4 text-indigo-500" />
                  My Training
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* In-house training log */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">In-House Training Log</p>
                  {inHouseLoading ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : !inHouseLog?.length ? (
                    <p className="text-sm text-muted-foreground">No in-house training records.</p>
                  ) : (
                    <div className="divide-y rounded-xl border">
                      {inHouseLog.slice(0, 5).map((log) => (
                        <div key={log.id} className="flex items-center justify-between px-3 py-2 gap-3">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{log.trainingName}</p>
                            <p className="text-xs text-muted-foreground">{log.date}</p>
                          </div>
                          <span className={`text-xs shrink-0 ${log.assessmentCompleted ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                            {log.assessmentCompleted ? "✓ Passed" : "No assessment"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Exam vouchers */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Exam Vouchers</p>
                  {vouchersLoading ? (
                    <Skeleton className="h-12 w-full rounded-xl" />
                  ) : !myVouchers?.length ? (
                    <p className="text-sm text-muted-foreground">No exam vouchers assigned.</p>
                  ) : (
                    <div className="divide-y rounded-xl border">
                      {myVouchers.map((v) => (
                        <div key={v.id} className="flex items-center justify-between px-3 py-2 gap-3">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{v.productName}</p>
                            <p className="text-xs text-muted-foreground">Expires: {v.mustBeUsedBy}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 ${
                            v.status === "complete_pass" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                            v.status === "expired" || v.status === "complete_fail" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                            "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          }`}>
                            {labelCase(v.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── My PPE ────────────────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="size-4 text-blue-500" />
                  My PPE
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ppeLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !myPpe?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No PPE records found.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {myPpe.map((iso) => (
                      <div key={iso.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{iso.ppeItem?.name ?? "PPE Item"}</p>
                          <p className="text-xs text-muted-foreground">
                            Issued: {iso.issuedDate}
                            {iso.size ? ` · Size: ${iso.size}` : ""}
                            {iso.assetTag ? ` · Tag: ${iso.assetTag}` : ""}
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 ${
                          iso.status === "issued" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                          iso.status === "returned" ? "bg-muted text-muted-foreground" :
                          "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}>
                          {labelCase(iso.status ?? "")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Access Registry ────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wifi className="size-4 text-cyan-500" />
                  My System Access
                </CardTitle>
              </CardHeader>
              <CardContent>
                {accessLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !myAccess?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No access registry entries found.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {myAccess.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{entry.platform?.name ?? "Platform"}</p>
                          {entry.accountUsername && (
                            <p className="text-xs text-muted-foreground">{entry.accountUsername}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {entry.privilegeLevel && (
                            <span className="text-xs text-muted-foreground">{entry.privilegeLevel}</span>
                          )}
                          <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            entry.accountActive ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          }`}>
                            {entry.accountActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Onboarding ─────────────────────────────────────────────── */}
          {staffProfileId && !!onboardingTaskList?.length && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="size-4 text-teal-500" />
                  My Onboarding Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                {onboardingLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center gap-2 text-sm">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {onboardingTaskList.filter((t) => t.isCompleted).length}
                      </span>
                      <span className="text-muted-foreground">of</span>
                      <span className="font-semibold">{onboardingTaskList.length}</span>
                      <span className="text-muted-foreground">tasks completed</span>
                    </div>
                    <div className="divide-y rounded-xl border">
                      {onboardingTaskList.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className={`shrink-0 size-4 rounded-full border-2 flex items-center justify-center text-xs ${
                            task.isCompleted ? "bg-blue-500 border-blue-500 text-white" : "border-muted-foreground"
                          }`}>
                            {task.isCompleted ? "✓" : ""}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-sm ${task.isCompleted ? "line-through text-muted-foreground" : "font-medium"}`}>
                              {task.taskName}
                            </p>
                            {task.category && (
                              <p className="text-xs text-muted-foreground">{task.category}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My Career Progression ─────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="size-4 text-violet-500" />
                  My Career Progression
                </CardTitle>
              </CardHeader>
              <CardContent>
                {careerLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !careerPlans?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No career progression plan on record.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {careerPlans.map((plan) => (
                      <div key={plan.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{plan.plannedRole ?? "Role not set"}</p>
                          <p className="text-xs text-muted-foreground">Target: {plan.targetYear}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 ${
                          plan.status === "achieved" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                          plan.status === "pending" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {labelCase(plan.status ?? "")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── My NOC Shifts ─────────────────────────────────────────────── */}
          {staffProfileId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="size-4 text-sky-500" />
                  My NOC Shifts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {shiftsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full rounded-xl" />
                    ))}
                  </div>
                ) : !shiftsThisMonth?.length && !shiftsNextMonth?.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No shift schedule entries found.</p>
                ) : (
                  <div className="divide-y rounded-xl border">
                    {[...(shiftsThisMonth ?? []), ...(shiftsNextMonth ?? [])].map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                        <span className="text-sm">{format(parseISO(shift.shiftDate), "EEE dd MMM yyyy")}</span>
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium shrink-0 ${
                          shift.shiftType === "12hr Day" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                          shift.shiftType === "12hr Night" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" :
                          shift.shiftType === "Annual Leave" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                          shift.shiftType === "Sick Leave" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {shift.shiftType}
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






