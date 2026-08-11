'use client';

import * as React from 'react';
import { Building2, Plus } from 'lucide-react';

import { api } from '@/lib/api';
import { useBrands } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import {
  BrandChip,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
} from '@/components/ui';

/**
 * Brands are normally created by typing them into an assignment or a contract.
 * This screen exists for the housekeeping that follows: fixing a colour,
 * adding the website, archiving one you no longer work with, and merging the
 * duplicate that someone inevitably creates.
 */
export default function BrandsPage() {
  const { data: brands } = useBrands();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');

  const create = async () => {
    if (!name.trim()) return;
    await api.post('/brands', { name: name.trim() });
    setName('');
    queryClient.invalidateQueries({ queryKey: ['brands'] });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Brands"
        description="The websites you produce for. New ones can also be created straight from any brand field."
      />

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Add a brand</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Field label="Name" className="flex-1">
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && create()}
                  placeholder="Selector"
                />
              )}
            </Field>
            <div className="flex items-end pb-1">
              <Button onClick={create} disabled={!name.trim()}>
                <Plus aria-hidden />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!brands || brands.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No brands yet"
          description="Add the websites you produce for, or just start typing one into an assignment."
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {brands.map((brand) => (
              <li key={brand.id} className="flex items-center gap-3 px-5 py-3">
                <BrandChip name={brand.name} colorHex={brand.colorHex} />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {brand.websiteUrl ?? 'No website recorded'}
                </span>
                <span className="tabular text-xs text-muted-foreground">
                  {brand.presenterCount ?? 0} presenters · {brand.activeAssignmentCount ?? 0} jobs
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
