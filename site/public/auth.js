const mount = document.querySelector('#google-signin');
const button = document.querySelector('#continue-with-google');
const status = document.querySelector('#auth-status');

function setStatus(message, tone) {
  if (!status) return;
  status.textContent = message || '';
  status.classList.remove('error', 'pending');
  if (tone) status.classList.add(tone);
}

if (mount && button) {
  const clientId = mount.dataset.clientId;
  const nonce = mount.dataset.nonce;
  let ready = false;
  let pending = false;

  const finish = async (credential) => {
    if (pending || !credential) return;
    pending = true;
    setStatus('Signing you in…', 'pending');
    try {
      const response = await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, nonce }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Please try signing in again.');
      window.location.assign('/auth/account');
    } catch (error) {
      pending = false;
      setStatus(error.message || 'Sign-in couldn\u2019t finish. Please try again.', 'error');
    }
  };

  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onerror = () => setStatus('Google sign-in couldn\u2019t load. Check your connection and refresh this page.', 'error');
  script.onload = () => {
    try {
      google.accounts.id.initialize({
        client_id: clientId,
        nonce,
        auto_select: false,
        callback: ({ credential }) => finish(credential),
      });
      ready = true;
      button.disabled = false;
      setStatus('');
    } catch (error) {
      setStatus('Google sign-in isn\u2019t available right now. Please refresh this page.', 'error');
    }
  };

  button.addEventListener('click', () => {
    if (!ready) { setStatus('Google sign-in is still loading…', 'pending'); return; }
    try {
      google.accounts.id.prompt((notification) => {
        if (notification && notification.isNotDisplayed && notification.isNotDisplayed()) {
          setStatus('Google sign-in could not open on this page. Please try again, or open Koini Studio to sign in.', 'error');
        }
      });
    } catch (error) {
      setStatus('Google sign-in could not start. Please try again.', 'error');
    }
  });

  document.head.append(script);
}
