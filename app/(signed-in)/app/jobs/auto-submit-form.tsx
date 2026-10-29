"use client";

import type { ComponentProps } from "react";

/**
 * A GET form that submits as soon as a dropdown changes, so filters apply
 * without pressing a button. Text inputs still submit on Enter or Apply.
 */
export function AutoSubmitForm(props: ComponentProps<"form">) {
  return (
    <form
      method="get"
      {...props}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    />
  );
}
