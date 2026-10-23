import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "../../shared/limits";
import { ChangePasswordInput } from "../../shared/schemas";
import { ApiRequestError, changePassword, deleteAccount, isApiError } from "../api";
import { LogoutButton } from "../components/LogoutButton";
import { Page } from "../components/Page";
import { FormAlert } from "../components/ui/alert";
import { Button, buttonVariants } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { accountErrorMessage } from "../lib/errors";
import { useMe } from "../lib/queries";
import { endSession, handleUnauthorized } from "../lib/session";
import { toast } from "../lib/toast";
import { useDocumentTitle } from "../lib/useDocumentTitle";

/** The shared rules plus "type it twice" and "different from the old one". */
const ChangePasswordForm = ChangePasswordInput.extend({
  currentPassword: z.string().min(1, "Enter your current password"),
  confirmPassword: z.string(),
})
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The new passwords don't match",
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password you haven't used here before",
  });

type ChangePasswordFormInput = z.input<typeof ChangePasswordForm>;
type ChangePasswordFormValues = z.output<typeof ChangePasswordForm>;

function ChangePasswordSection() {
  const form = useForm<ChangePasswordFormInput, unknown, ChangePasswordFormValues>({
    resolver: zodResolver(ChangePasswordForm),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const [formError, setFormError] = useState("");
  const { errors, isSubmitting } = form.formState;

  // Called directly (not via useMutation) so passwords never sit in the cache.
  const submit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError("");
    try {
      await changePassword({ currentPassword, newPassword });
      form.reset();
      toast.success("Password changed", "You've been signed out everywhere else.");
    } catch (error) {
      form.resetField("currentPassword");
      if (isApiError(error, 401)) {
        handleUnauthorized();
        return;
      }
      setFormError(accountErrorMessage(error));
      if (error instanceof ApiRequestError) {
        for (const field of ["currentPassword", "newPassword"] as const) {
          const message = error.fields[field]?.[0];
          if (message) {
            form.setError(field, {
              message: field === "currentPassword" ? "That isn't your current password" : message,
            });
          }
        }
      }
    }
  });

  return (
    <section aria-labelledby="password-heading">
      <Card className="p-5 sm:p-6">
        <h2 id="password-heading" className="mb-4 text-3xl">
          Change password
        </h2>
        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <FormAlert>{formError}</FormAlert>
          <Field label="Current password" required error={errors.currentPassword?.message}>
            <Input
              type="password"
              autoComplete="current-password"
              {...form.register("currentPassword")}
            />
          </Field>
          <Field
            label="New password"
            required
            error={errors.newPassword?.message}
            hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters.`}
          >
            <Input type="password" autoComplete="new-password" {...form.register("newPassword")} />
          </Field>
          <Field label="Confirm new password" required error={errors.confirmPassword?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
          </Field>
          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Changing password…" : "Change password"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}

function DeleteAccountSection() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword("");
    setError("");
  };

  const confirm = async () => {
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await deleteAccount({ password });
      await endSession(queryClient, () => navigate("/", { replace: true }));
      toast.success("Your account has been deleted.");
    } catch (err) {
      if (isApiError(err, 401)) {
        handleUnauthorized();
        return;
      }
      setPassword("");
      setError(
        isApiError(err, 400) || isApiError(err, 403)
          ? "That password isn't right."
          : accountErrorMessage(err),
      );
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="delete-heading">
      <Card className="border-danger p-5 sm:p-6">
        <h2 id="delete-heading" className="mb-2 text-3xl">
          Delete account
        </h2>
        <p className="mb-4 text-muted">
          This permanently deletes your account, your listings, and your saved listings.
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </Card>
      <ConfirmDialog
        open={open}
        asForm
        title="Delete your account?"
        description={<p>This can't be undone. Enter your password to confirm.</p>}
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        busy={pending}
        onCancel={close}
        onConfirm={() => void confirm()}
      >
        <div className="flex flex-col gap-3">
          <FormAlert focusOnShow={false}>{error}</FormAlert>
          <Field label="Password" required>
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        </div>
      </ConfirmDialog>
    </section>
  );
}

export function ProfilePage() {
  useDocumentTitle("Profile");
  const me = useMe();
  if (!me) {
    return null; // the route loader redirects guests
  }
  return (
    <Page narrow className="flex flex-col gap-8">
      <Card className="p-5 sm:p-8">
        <h1 className="text-5xl [overflow-wrap:anywhere]">Hi, {me.username}!</h1>
        <p className="mt-1 text-lg text-muted">Manage your listings and your account.</p>
        <dl className="my-6 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
          <div>
            <dt className="text-sm font-semibold tracking-wide text-muted uppercase">Username</dt>
            <dd className="text-lg [overflow-wrap:anywhere]">{me.username}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold tracking-wide text-muted uppercase">Member ID</dt>
            <dd className="text-lg">{me.id}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3 [&>*]:max-sm:flex-1">
          <Link to="/mylistings" className={buttonVariants()}>
            My listings
          </Link>
          <Link to="/saved" className={buttonVariants({ variant: "outline" })}>
            Saved listings
          </Link>
          <LogoutButton className={buttonVariants({ variant: "outline" })} />
        </div>
      </Card>
      <ChangePasswordSection />
      <DeleteAccountSection />
    </Page>
  );
}
