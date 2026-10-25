import { FormEvent, useState } from 'react';
import { addressApi } from '../api';
import type { Address, AddressInput } from '../data/orders';
import { ApiError } from '../http';

interface Props {
  /** Address being edited, or null to add a new one. */
  address: Address | null;
  /** True when this will be the user's first address (it becomes the default). */
  isFirst?: boolean;
  onSaved: (saved: Address) => void;
  onCancel: () => void;
}

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** Add or edit a delivery address. Used on the Addresses page and inside checkout. */
export default function AddressForm({ address, isFirst = false, onSaved, onCancel }: Props) {
  const [fullName, setFullName] = useState(address?.fullName ?? '');
  const [phone, setPhone] = useState(address?.phone ?? '');
  const [line1, setLine1] = useState(address?.line1 ?? '');
  const [line2, setLine2] = useState(address?.line2 ?? '');
  const [landmark, setLandmark] = useState(address?.landmark ?? '');
  const [city, setCity] = useState(address?.city ?? '');
  const [state, setState] = useState(address?.state ?? 'Haryana');
  const [pincode, setPincode] = useState(address?.pincode ?? '');
  const [type, setType] = useState<Address['type']>(address?.type ?? 'HOME');
  const [makeDefault, setMakeDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body: AddressInput = { fullName, phone, line1, line2, landmark, city, state, pincode, type, makeDefault };
    try {
      onSaved(address ? await addressApi.update(address.id, body) : await addressApi.create(body));
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors.length ? err.fieldErrors.join(' · ') : err.message) : "Can't reach the address service. Is it running on port 8084?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="addr-form" onSubmit={submit}>
      <h3>{address ? 'Edit address' : 'Add a new address'}</h3>
      <div className="pf-row">
        <label className="field">Full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
        </label>
        <label className="field">Mobile number
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} required inputMode="numeric" pattern="[6-9][0-9]{9}" title="10-digit mobile number" autoComplete="tel-national" />
        </label>
      </div>
      <label className="field">Address (house no., street)
        <input value={line1} onChange={(e) => setLine1(e.target.value)} required minLength={3} maxLength={120} autoComplete="address-line1" />
      </label>
      <label className="field">Area, colony (optional)
        <input value={line2} onChange={(e) => setLine2(e.target.value)} maxLength={120} autoComplete="address-line2" />
      </label>
      <label className="field">Landmark (optional)
        <input value={landmark} onChange={(e) => setLandmark(e.target.value)} maxLength={80} placeholder="Near the metro station" />
      </label>
      <div className="pf-row">
        <label className="field">Pincode
          <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} required inputMode="numeric" pattern="[1-9][0-9]{5}" title="6-digit pincode" autoComplete="postal-code" />
        </label>
        <label className="field">City
          <input value={city} onChange={(e) => setCity(e.target.value)} required minLength={2} maxLength={60} autoComplete="address-level2" />
        </label>
      </div>
      <label className="field">State
        <select value={state} onChange={(e) => setState(e.target.value)} required>
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <div className="addr-types" role="radiogroup" aria-label="Address type">
        {(['HOME', 'WORK', 'OTHER'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className={`pill ${type === t ? 'pill-on' : ''}`} onClick={() => setType(t)}>
            {t === 'HOME' ? '🏠 Home' : t === 'WORK' ? '🏢 Work' : '📍 Other'}
          </button>
        ))}
      </div>
      {!isFirst && !address?.isDefault && (
        <label className="check">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Make this my default address
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="pf-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : address ? 'Save changes' : 'Save address'}</button>
      </div>
    </form>
  );
}
