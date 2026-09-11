import { useEffect } from 'react';
import { useAuth } from '../store/AuthContext';
import useStore from '../store/useStore';
import { AuthSkeleton } from './Skeleton';

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      useStore.getState().setPage('home');
    }
  }, [user, loading]);

  if (loading) return <AuthSkeleton />;
  if (!user) return null;

  return children;
}
