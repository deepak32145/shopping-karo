const items = [
  { icon: '📉', title: 'Honest prices', text: '12-week price history on every product. No fake "was" prices.' },
  { icon: '🚚', title: 'Tomorrow, locally', text: 'Fast delivery from sellers near your pincode.' },
  { icon: '✅', title: 'Verified sellers', text: 'Every seller is KYC-checked before they list.' },
  { icon: '↩️', title: '7-day easy returns', text: 'Change of mind? Pick-up from your door.' },
  { icon: '📲', title: 'UPI-first checkout', text: 'Pay in two taps with any UPI app, card or netbanking.' },
];

export default function TrustStrip() {
  return (
    <section className="section trust">
      {items.map((i) => (
        <div key={i.title} className="trust-item">
          <span className="trust-icon" aria-hidden="true">{i.icon}</span>
          <div>
            <b>{i.title}</b>
            <p>{i.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
