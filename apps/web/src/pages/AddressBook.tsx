import { useCallback, useEffect, useState } from 'react';
import { addressApi } from '../api';
import type { User } from '../auth';
import AddressForm from '../components/AddressForm';
import type { Address } from '../data/orders';
import { ApiError } from '../http';
import { addressLines } from '../lib';

interface Props {
  user: User | null;
  authReady: boolean;
  onSignIn: () => void;
}

const TYPE_ICON: Record<Address['type'], string> = { HOME: '🏠', WORK: '🏢', OTHER: '📍' };

export default function AddressBook({ user, authReady, onSignIn }: Props) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAddresses(await addressApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the address service. Is it running on port 8084?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  };

  if (!authReady) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <div className="empty"><h2>Your addresses</h2><p>Sign in to save delivery addresses.</p><button className="btn btn-dark" onClick={onSignIn}>Sign in</button></div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="admin-head">
        <div>
          <h1>Your addresses</h1>
          <p className="muted">Saved addresses make checkout one tap. You can keep up to 10.</p>
        </div>
        {editing === null && <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add address</button>}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {editing !== null && (
        <div className="panel">
          <AddressForm
            address={editing === 'new' ? null : editing}
            isFirst={addresses.length === 0}
            onSaved={() => { setEditing(null); void load(); }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {loading ? (
        <p className="muted">Loading addresses…</p>
      ) : addresses.length === 0 && editing === null ? (
        <div className="empty"><p>No saved addresses yet.</p><button className="btn btn-dark" onClick={() => setEditing('new')}>Add your first address</button></div>
      ) : (
        <div className="addr-grid">
          {addresses.map((a) => (
            <article key={a.id} className={`addr-card ${a.isDefault ? 'addr-default' : ''}`}>
              <div className="addr-top">
                <span className="addr-type">{TYPE_ICON[a.type]} {a.type[0] + a.type.slice(1).toLowerCase()}</span>
                {a.isDefault && <span className="tag">Default</span>}
              </div>
              <b>{a.fullName}</b>
              <p>{addressLines(a)}</p>
              <p className="muted">Mobile: {a.phone}</p>
              <div className="addr-actions">
                <button className="link" onClick={() => setEditing(a)}>Edit</button>
                {!a.isDefault && <button className="link" onClick={() => act(() => addressApi.setDefault(a.id))}>Set as default</button>}
                <button
                  className="link danger"
                  onClick={() => window.confirm('Delete this address?') && void act(() => addressApi.remove(a.id))}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
