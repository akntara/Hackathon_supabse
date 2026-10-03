"use client";

import { useActionState } from "react";
import { createEvent, type CreateEventState } from "@/app/dashboard/actions";
import { Button, Card, Input, Label, Textarea } from "./ui";

export function CreateEventForm() {
  const [state, action, pending] = useActionState<CreateEventState, FormData>(
    createEvent,
    undefined,
  );

  return (
    <Card className="p-6">
      <h2 className="font-semibold text-slate-900">New event</h2>
      <p className="mt-1 text-sm text-slate-500">
        You&apos;ll get a public link and code to share with your audience.
      </p>
      <form action={action} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required maxLength={120} placeholder="Q3 All-hands" />
        </div>
        <div>
          <Label htmlFor="description">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            maxLength={1000}
            placeholder="What's this session about?"
          />
        </div>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={pending}>
          Create event
        </Button>
      </form>
    </Card>
  );
}
