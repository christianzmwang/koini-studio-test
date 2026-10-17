const container = document.querySelector('#google-signin');
if (container) {
  const status = document.querySelector('#auth-status');
  let pending = false;
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onerror = () => { status.textContent = 'Google sign-in couldn’t load. Check your connection and refresh this page.'; };
  script.onload = () => {
    google.accounts.id.initialize({
      client_id: container.dataset.clientId,
      nonce: container.dataset.nonce,
      auto_select: false,
      callback: async ({ credential }) => {
        if (pending) return;
        pending = true;
        status.textContent = 'Signing you in…';
        try {
          const response = await fetch('/auth/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential, nonce: container.dataset.nonce }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Please try signing in again.');
          window.location.assign('/auth/account');
        } catch (error) {
          status.textContent = error.message || 'Sign-in couldn’t finish. Please try again.';
          pending = false;
        }
      },
    });
    google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 280 });
    status.textContent = '';
  };
  document.head.append(script);
}
