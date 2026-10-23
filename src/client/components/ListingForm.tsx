import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { DESCRIPTION_MAX, TITLE_MAX } from "../../shared/limits";
import {
  ImageUrl,
  PostingFormInput,
  type PostingFormValues,
  type PostingInput,
} from "../../shared/schemas";
import { ApiRequestError } from "../api";
import { listingErrorMessage } from "../lib/errors";
import { FormAlert } from "./ui/alert";
import { Button, buttonVariants } from "./ui/button";
import { Field } from "./ui/field";
import { Input, Textarea } from "./ui/input";

const FIELDS = ["title", "imageUrl", "price", "description"] as const;
// The API names the price field priceCents; the form calls it price.
const fieldFor = (apiField: string) => (apiField === "priceCents" ? "price" : apiField);

type ListingFormProps = {
  defaultValues?: PostingFormValues;
  submitLabel: string;
  pendingLabel: string;
  /** Rejects with an ApiRequestError on failure; the form shows it. */
  onSubmit: (input: PostingInput) => Promise<unknown>;
  /** Where Cancel goes (a link, so it works without JavaScript state). */
  cancelHref: string;
  onCancel?: () => void;
};

const EMPTY: PostingFormValues = { title: "", description: "", imageUrl: "", price: "" };

/**
 * Shared create / edit form. Validation is the shared PostingFormInput
 * schema (the same rules the API enforces); the price is typed in dollars
 * and sent as integer cents via shared/money.ts.
 */
export function ListingForm({
  defaultValues = EMPTY,
  submitLabel,
  pendingLabel,
  onSubmit,
  cancelHref,
  onCancel,
}: ListingFormProps) {
  const form = useForm<PostingFormValues, unknown, PostingInput>({
    resolver: zodResolver(PostingFormInput),
    defaultValues,
    mode: "onTouched",
  });
  const [formError, setFormError] = useState("");
  const [previewFailedFor, setPreviewFailedFor] = useState<string | null>(null);
  const { errors, isSubmitting } = form.formState;
  const [title = "", description = "", imageUrl = ""] = useWatch({
    control: form.control,
    name: ["title", "description", "imageUrl"],
  });
  const previewUrl = ImageUrl.safeParse(imageUrl).success ? imageUrl.trim() : null;

  const submit = form.handleSubmit(async (input) => {
    setFormError("");
    try {
      await onSubmit(input);
    } catch (error) {
      setFormError(listingErrorMessage(error));
      if (error instanceof ApiRequestError) {
        for (const [apiField, messages] of Object.entries(error.fields)) {
          const field = fieldFor(apiField);
          const message = messages[0];
          if (message && (FIELDS as readonly string[]).includes(field)) {
            form.setError(field as (typeof FIELDS)[number], { message });
          }
        }
      }
    }
  });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <FormAlert>{formError}</FormAlert>

      <Field
        label="Title"
        required
        error={errors.title?.message}
        hint={`${title.length}/${TITLE_MAX} characters`}
      >
        <Input
          maxLength={TITLE_MAX}
          autoComplete="off"
          placeholder="e.g. GMK Olivia++ base kit"
          {...form.register("title")}
        />
      </Field>

      <Field
        label="Photo URL"
        required
        error={errors.imageUrl?.message}
        hint="A direct link to a photo of the item, starting with https://"
      >
        <Input
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          {...form.register("imageUrl")}
        />
      </Field>

      {previewUrl && (
        <div className="max-w-xs overflow-hidden rounded-lg border border-line bg-primary-soft">
          {previewFailedFor === previewUrl ? (
            <p className="p-3 text-sm text-muted">
              We couldn't load an image from that link. Check that it points directly to a photo.
            </p>
          ) : (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError detects a broken link, it isn't a user interaction
            <img
              src={previewUrl}
              alt="Preview of your listing"
              referrerPolicy="no-referrer"
              onError={() => setPreviewFailedFor(previewUrl)}
              className="block max-h-60 w-full object-cover"
            />
          )}
        </div>
      )}

      <Field
        label="Price (USD)"
        required
        error={errors.price?.message}
        hint="Dollars and cents, like 45 or 45.50. Use 0 for trades or giveaways."
      >
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          {...form.register("price")}
        />
      </Field>

      <Field
        label="Description"
        error={errors.description?.message}
        hint={`Optional. Condition, what's included, trade preferences. ${description.length}/${DESCRIPTION_MAX}`}
      >
        <Textarea rows={6} maxLength={DESCRIPTION_MAX} {...form.register("description")} />
      </Field>

      <div className="flex flex-wrap justify-end gap-3 [&>*]:max-sm:flex-1">
        <a
          href={cancelHref}
          onClick={(event) => {
            if (onCancel) {
              event.preventDefault();
              onCancel();
            }
          }}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Cancel
        </a>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
