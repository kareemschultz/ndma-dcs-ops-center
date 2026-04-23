import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, FolderOpen, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Label } from "@ndma-dcs-staff-portal/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ndma-dcs-staff-portal/ui/components/select";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ndma-dcs-staff-portal/ui/components/tabs";
import { Textarea } from "@ndma-dcs-staff-portal/ui/components/textarea";

import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { useSession } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/policy/")({
  component: PolicyPage,
});

type EmergencyContact = { name: string; phone: string; relation?: string };

const CONTACT_RELATIONS = [
  "Spouse",
  "Partner",
  "Parent",
  "Sibling",
  "Child",
  "Other",
] as const;

function PolicyPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [tab, setTab] = useState("policies");
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [contacts, setContacts] = useState<EmergencyContact[]>([
    { name: "", phone: "", relation: "" },
  ]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadCategory, setUploadCategory] = useState<"HR & Leave" | "Finance" | "Operations" | "IT" | "General">("HR & Leave");
  const [uploadFileUrl, setUploadFileUrl] = useState("");

  const { data: policies, isLoading: policiesLoading } = useQuery(
    orpc.policy.policies.list.queryOptions({ input: {} }),
  );
  const { data: forms, isLoading: formsLoading } = useQuery(
    orpc.policy.forms.list.queryOptions({ input: {} }),
  );
  const { data: me } = useQuery(orpc.staff.me.queryOptions());

  const selectedPolicy = useMemo(
    () => (policies ?? []).find((policy) => policy.id === selectedPolicyId) ?? (policies ?? [])[0] ?? null,
    [policies, selectedPolicyId],
  );

  const updateSelf = useMutation(
    orpc.staff.updateSelf.mutationOptions({
      onSuccess: async () => {
        toast.success("Profile updated");
        await queryClient.invalidateQueries({ queryKey: orpc.staff.me.key() });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const uploadForm = useMutation(
    orpc.policy.forms.upload.mutationOptions({
      onSuccess: async () => {
        toast.success("Form uploaded");
        await queryClient.invalidateQueries({ queryKey: orpc.policy.forms.list.key() });
        setUploadTitle("");
        setUploadDescription("");
        setUploadFileUrl("");
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  const isPrivileged = ["admin", "hrAdminOps", "manager", "personalAssistant"].includes(
    String((session?.user as Record<string, unknown> | undefined)?.role ?? "").toLowerCase(),
  );

  const currentPolicy = selectedPolicy ?? null;

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Policies &amp; Forms</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>

      <Main className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policies &amp; Forms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Company policy documents, internal forms, and self-service contact updates.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Self-Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  value={phoneNumber || me?.phoneNumber || ""}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Update your own number"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Emergency Contacts</Label>
                <p className="text-xs text-muted-foreground">
                  Edit only your own contacts. Add up to three entries.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {contacts.map((contact, index) => (
                <div key={index} className="grid gap-3 md:grid-cols-3">
                  <Input
                    value={contact.name}
                    onChange={(e) =>
                      setContacts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Name"
                  />
                  <Input
                    value={contact.phone}
                    onChange={(e) =>
                      setContacts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, phone: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Phone"
                  />
                  <div className="flex gap-2">
                    <Select
                      value={contact.relation ?? ""}
                      onValueChange={(value) =>
                        setContacts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, relation: value ? value : undefined }
                              : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Relation" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_RELATIONS.map((relation) => (
                          <SelectItem key={relation} value={relation}>
                            {relation}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setContacts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  setContacts((current) =>
                    current.length >= 3
                      ? current
                      : [...current, { name: "", phone: "", relation: "" }],
                  )
                }
                variant="outline"
              >
                Add Contact
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const payload = {
                    phoneNumber: phoneNumber || me?.phoneNumber || undefined,
                    emergencyContacts: contacts
                      .filter((contact) => contact.name || contact.phone || contact.relation)
                      .map((contact) => ({
                        name: contact.name,
                        phone: contact.phone,
                        relation: contact.relation || undefined,
                      })),
                  };
                  updateSelf.mutate(payload);
                }}
              >
                Save Self-Service
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="policies">NDMA Policies</TabsTrigger>
            <TabsTrigger value="forms">Internal Forms</TabsTrigger>
          </TabsList>

          <TabsContent value="policies" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {policiesLoading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full rounded-lg" />
                    ))
                  ) : (policies ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No policy documents available.</p>
                  ) : (
                    (policies ?? []).map((policy) => (
                      <button
                        key={policy.id}
                        type="button"
                        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                          currentPolicy?.id === policy.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedPolicyId(policy.id)}
                      >
                        <p className="font-medium">{policy.title}</p>
                        <p className="text-xs text-muted-foreground">{policy.lastUpdated}</p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {currentPolicy?.title ?? "Policy Viewer"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentPolicy ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Updated {currentPolicy.lastUpdated}</Badge>
                        {currentPolicy.documentUrl && (
                          <Button size="sm" variant="outline" render={<a href={currentPolicy.documentUrl} target="_blank" rel="noreferrer" />}>
                            <FileText className="mr-1.5 size-3.5" />
                            Open Document
                          </Button>
                        )}
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-6 whitespace-pre-wrap">
                        {currentPolicy.contentText}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Select a policy to view its contents.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="forms" className="space-y-4">
            {isPrivileged && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Upload Form</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value as typeof uploadCategory)}
                    >
                      <option value="HR & Leave">HR & Leave</option>
                      <option value="Finance">Finance</option>
                      <option value="Operations">Operations</option>
                      <option value="IT">IT</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Description</Label>
                    <Textarea value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>File URL</Label>
                    <Input value={uploadFileUrl} onChange={(e) => setUploadFileUrl(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      onClick={() =>
                        uploadForm.mutate({
                          title: uploadTitle,
                          description: uploadDescription || undefined,
                          category: uploadCategory,
                          fileUrl: uploadFileUrl,
                        })
                      }
                      disabled={!uploadTitle || !uploadFileUrl || uploadForm.isPending}
                    >
                      <Upload className="mr-1.5 size-3.5" />
                      Upload
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {formsLoading ? (
                Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)
              ) : (forms ?? []).length === 0 ? (
                <Card className="md:col-span-2 xl:col-span-3">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No internal forms available.
                  </CardContent>
                </Card>
              ) : (
                (forms ?? []).map((form) => (
                  <Card key={form.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{form.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <Badge variant="outline">{form.category}</Badge>
                      <p className="text-muted-foreground">{form.description ?? "No description provided."}</p>
                      <Button size="sm" variant="outline" render={<a href={form.fileUrl} target="_blank" rel="noreferrer" />}>
                        <FolderOpen className="mr-1.5 size-3.5" />
                        Download
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
