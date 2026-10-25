export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-in">
        <div>
          <div className="logo"><span className="logo-mark" aria-hidden="true">🛍️</span><span>shopping<em>karo</em></span></div>
          <p className="muted">Made in Gurgaon. Shop smarter, spend honestly.</p>
        </div>
        <nav aria-label="Footer">
          <a href="#">Sell on Shopping Karo</a>
          <a href="#">Help &amp; returns</a>
          <a href="#">Track order</a>
          <a href="#">Privacy</a>
        </nav>
      </div>
      <p className="legal">© {new Date().getFullYear()} Shopping Karo. Demo storefront with sample data.</p>
    </footer>
  );
}
