import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from "../../shared/limits";
import { RegisterInput } from "../../shared/schemas";
import { ApiRequestError, isApiError, login, register } from "../api";
import { loginErrorMessage, registerErrorMessage } from "../lib/errors";
import { setSignedIn } from "../lib/queries";
import { toast } from "../lib/toast";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { FormAlert } from "./ui/alert";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field } from "./ui/field";
import { Input } from "./ui/input";

type HeadingLevel = "h1" | "h2";

/**
 * Mirrors LoginInput (shape and size only, so it reveals nothing about the
 * new-account rules) but with messages for people.
 */
const LoginForm = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter your username")
    .max(USERNAME_MAX, "That username is too long"),
  password: z
    .string()
    .min(1, "Enter your password")
    .max(PASSWORD_MAX * 4, "That password is too long"),
});
type LoginFormInput = z.input<typeof LoginForm>;
type LoginFormValues = z.output<typeof LoginForm>;

/** The shared register rules, minus the Turnstile token (handled separately). */
const RegisterForm = RegisterInput.omit({ turnstileToken: true });
type RegisterFormInput = z.input<typeof RegisterForm>;
type RegisterFormValues = z.output<typeof RegisterForm>;

const SECURITY_CHECK = "Please complete the security check first.";

function useAuthSuccess(next: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (user: { id: number; username: string }, message: string) => {
    setSignedIn(queryClient, user);
    toast.success(message);
    void navigate(next ?? "/market", { replace: true });
  };
}

export function LoginFormCard({
  next,
  headingLevel: Heading = "h1",
}: {
  next: string | null;
  headingLevel?: HeadingLevel;
}) {
  const form = useForm<LoginFormInput, unknown, LoginFormValues>({
    resolver: zodResolver(LoginForm),
    defaultValues: { username: "", password: "" },
  });
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  const onSuccess = useAuthSuccess(next);
  const { errors } = form.formState;

  // Credentials go straight to the API (not through useMutation) so they're
  // never held in the query cache; the password field is cleared afterwards.
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError("");
    if (!token) {
      setFormError(SECURITY_CHECK);
      return;
    }
    setPending(true);
    try {
      const user = await login({ ...values, turnstileToken: token });
      onSuccess(user, `Welcome back, ${user.username}!`);
    } catch (error) {
      form.resetField("password");
      turnstile.current?.reset();
      setFormError(loginErrorMessage(error));
      setPending(false);
    }
  });

  return (
    <Card className="mx-auto w-full max-w-md p-6 shadow-sm">
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
        aria-labelledby="login-heading"
      >
        <Heading id="login-heading" className="text-3xl">
          Log in
        </Heading>
        <FormAlert>{formError}</FormAlert>
        <Field label="Username" required error={errors.username?.message}>
          <Input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register("username")}
          />
        </Field>
        <Field label="Password" required error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
        <Turnstile action="login" ref={turnstile} onToken={setToken} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </Card>
  );
}

export function RegisterFormCard({
  next,
  headingLevel: Heading = "h1",
}: {
  next: string | null;
  headingLevel?: HeadingLevel;
}) {
  const form = useForm<RegisterFormInput, unknown, RegisterFormValues>({
    resolver: zodResolver(RegisterForm),
    defaultValues: { username: "", password: "" },
  });
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  const onSuccess = useAuthSuccess(next);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError("");
    if (!token) {
      setFormError(SECURITY_CHECK);
      return;
    }
    setPending(true);
    try {
      const user = await register({
        username: values.username.trim(),
        password: values.password,
        turnstileToken: token,
      });
      onSuccess(user, `Welcome to Keebhub, ${user.username}!`);
    } catch (error) {
      form.resetField("password");
      turnstile.current?.reset();
      setFormError(registerErrorMessage(error));
      if (isApiError(error, 409)) {
        form.setError("username", { message: "That username is already taken." });
      } else if (error instanceof ApiRequestError) {
        // Server-side field messages (e.g. "found in a data breach") are for people.
        for (const field of ["username", "password"] as const) {
          const message = error.fields[field]?.[0];
          if (message) {
            form.setError(field, { message });
          }
        }
      }
      setPending(false);
    }
  });

  return (
    <Card className="mx-auto w-full max-w-md p-6 shadow-sm">
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
        aria-labelledby="register-heading"
      >
        <Heading id="register-heading" className="text-3xl">
          Create an account
        </Heading>
        <FormAlert>{formError}</FormAlert>
        <Field
          label="Username"
          required
          error={errors.username?.message}
          hint={`${USERNAME_MIN}–${USERNAME_MAX} characters: letters, numbers, dots, underscores and hyphens.`}
        >
          <Input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register("username")}
          />
        </Field>
        <Field
          label="Password"
          required
          error={errors.password?.message}
          hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters. A few random words make a strong password.`}
        >
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Turnstile action="register" ref={turnstile} onToken={setToken} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </Card>
  );
}
