'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';

import { cn, readableTextOn } from '@/lib/utils';
import { Badge } from '@/components/ui';

/**
 * The "just type the website" control.
 * ---------------------------------------------------------------------------
 * The brief was explicit: not a dropdown someone has to maintain, a text field
 * you can type into. A plain text field, though, produces "Aspirex", "aspirex"
 * and "Aspirex " as three different brands within a fortnight, and the moment
 * that happens the reporting is wrong and nobody trusts the tool again.
 *
 * So this is a combobox with three behaviours:
 *
 *   1. Type freely. It filters what already exists as you go.
 *   2. If what you typed matches nothing, the last row is
 *      `Create "Selector"` — one keystroke (Enter) and it exists.
 *   3. Near-matches are shown BEFORE the create option, so if "South London
 *      College" already exists, typing "south london" surfaces it rather than
 *      quietly letting you make a second one.
 *
 * The server does the final de-duplication by slug (see TaxonomyService), so
 * even a race between two people typing the same new brand resolves to one row.
 *
 * The value it emits is the shared `NameOrId` union: `{ id }` for something
 * picked, `{ name }` for something typed fresh.
 */

export interface ComboboxOption {
  id: string;
  name: string;
  colorHex?: string;
  meta?: string;
}

export type NameOrIdValue = { id: string; name: string } | { name: string };

interface EntityComboboxProps {
  options: ComboboxOption[];
  value: NameOrIdValue | null;
  onChange: (value: NameOrIdValue | null) => void;
  placeholder?: string;
  /** Singular noun used in the create row, e.g. "brand", "tag", "work type". */
  entityLabel: string;
  allowCreate?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

export function EntityCombobox({
  options,
  value,
  onChange,
  placeholder = 'Type to search…',
  entityLabel,
  allowCreate = true,
  disabled,
  className,
  ...aria
}: EntityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const normalised = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      normalised
        ? options.filter((o) => o.name.toLowerCase().includes(normalised))
        : options,
    [options, normalised],
  );

  // Only offer "create" when nothing matches EXACTLY. A near match still shows
  // in the list above, which is the nudge away from creating a duplicate.
  const exactMatch = options.find((o) => o.name.toLowerCase() === normalised);
  const showCreate = allowCreate && normalised.length > 0 && !exactMatch;

  const selectedLabel = value ? ('name' in value ? value.name : '') : '';
  const selectedColour = value && 'id' in value
    ? options.find((o) => o.id === value.id)?.colorHex
    : undefined;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-[invalid=true]:border-destructive',
            className,
          )}
          {...aria}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              {selectedColour ? (
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedColour }}
                  aria-hidden
                />
              ) : null}
              <span className="truncate">{selectedLabel}</span>
              {!('id' in value) ? (
                <Badge tone="primary" className="shrink-0">
                  new
                </Badge>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}

          <span className="flex shrink-0 items-center gap-1">
            {value && !disabled ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Clear ${entityLabel}`}
                className="rounded p-0.5 hover:bg-muted"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(null);
                  }
                }}
              >
                <X className="size-3.5 text-muted-foreground" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </span>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] animate-slide-up overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          <Command shouldFilter={false} loop>
            <div className="border-b px-3">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && !showCreate ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No {entityLabel}s yet — start typing to add the first one.
                </p>
              ) : null}

              {filtered.map((option) => (
                <Command.Item
                  key={option.id}
                  value={option.id}
                  onSelect={() => {
                    onChange({ id: option.id, name: option.name });
                    setQuery('');
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  {option.colorHex ? (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: option.colorHex }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="flex-1 truncate">{option.name}</span>
                  {option.meta ? (
                    <span className="text-xs text-muted-foreground">{option.meta}</span>
                  ) : null}
                  {value && 'id' in value && value.id === option.id ? (
                    <Check className="size-4 text-primary" aria-hidden />
                  ) : null}
                </Command.Item>
              ))}

              {showCreate ? (
                <>
                  {filtered.length > 0 ? <div className="my-1 border-t" /> : null}
                  <Command.Item
                    value={`__create__${query}`}
                    onSelect={() => {
                      onChange({ name: query.trim() });
                      setQuery('');
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                  >
                    <Plus className="size-4 text-primary" aria-hidden />
                    <span>
                      Create {entityLabel} <span className="font-medium">“{query.trim()}”</span>
                    </span>
                  </Command.Item>
                  {filtered.length > 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      {filtered.length} existing {entityLabel}
                      {filtered.length === 1 ? '' : 's'} match — check the list before adding a new one.
                    </p>
                  ) : null}
                </>
              ) : null}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Multi-select version for tags. Same rules, but selections become removable
 * chips beneath the field rather than replacing the input value.
 */
export function EntityMultiCombobox({
  options,
  values,
  onChange,
  entityLabel,
  placeholder,
}: {
  options: ComboboxOption[];
  values: NameOrIdValue[];
  onChange: (values: NameOrIdValue[]) => void;
  entityLabel: string;
  placeholder?: string;
}) {
  const selectedIds = new Set(values.filter((v) => 'id' in v).map((v) => (v as { id: string }).id));
  const available = options.filter((o) => !selectedIds.has(o.id));

  return (
    <div className="space-y-2">
      <EntityCombobox
        options={available}
        value={null}
        onChange={(value) => {
          if (!value) return;
          const alreadyThere = values.some((v) =>
            'id' in v && 'id' in value
              ? v.id === value.id
              : v.name.toLowerCase() === value.name.toLowerCase(),
          );
          if (!alreadyThere) onChange([...values, value]);
        }}
        entityLabel={entityLabel}
        placeholder={placeholder ?? `Add a ${entityLabel}…`}
      />

      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value, index) => {
            const colour = 'id' in value ? options.find((o) => o.id === value.id)?.colorHex : undefined;
            return (
              <li key={`${value.name}-${index}`}>
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  style={
                    colour
                      ? { backgroundColor: colour, color: readableTextOn(colour), borderColor: colour }
                      : undefined
                  }
                >
                  {value.name}
                  <button
                    type="button"
                    aria-label={`Remove ${value.name}`}
                    onClick={() => onChange(values.filter((_, i) => i !== index))}
                    className="rounded-full hover:opacity-70"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
