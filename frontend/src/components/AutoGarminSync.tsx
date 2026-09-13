import { useAuth } from '../contexts/AuthContext'
import { useAutoGarminSync } from '../hooks/useAutoGarminSync'

function SignedInSync({ userId }: { userId: number }) {
  useAutoGarminSync(userId)
  return null
}

/** One lifecycle for the whole app, including direct links into subpages. */
export default function AutoGarminSync() {
  const { user, isLoading } = useAuth()
  return !isLoading && user ? <SignedInSync key={user.id} userId={user.id}/> : null
}
