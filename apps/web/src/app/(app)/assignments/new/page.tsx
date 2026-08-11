import NewAssignmentClient from './new-assignment-client';

type NewAssignmentPageProps = {
  searchParams: Promise<{
    presenterId?: string | string[];
  }>;
};

export default async function NewAssignmentPage({ searchParams }: NewAssignmentPageProps) {
  const params = await searchParams;
  const presenterId = Array.isArray(params.presenterId)
    ? params.presenterId[0] ?? null
    : params.presenterId ?? null;

  return <NewAssignmentClient initialPresenterId={presenterId} />;
}