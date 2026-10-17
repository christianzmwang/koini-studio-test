# Disposable test environment

This repository copies Koini Studio at commit
`355b9b03de20d6643d734fb789a428bca9e074ae`, including the furniture gallery,
Three.js room viewers, finishes, room-sharing landing page, privacy/support
routes, and Google sign-in/account/sign-out flow.

The test website uses `https://koini-studio-test.vercel.app`. The Google web
OAuth client is named **Koini Studio Test — disposable** in Google Cloud project
`gen-lang-client-0184978152`. This is a separate client from Lab3D, Sofia Review,
and the production Studio website. Only the test origin is authorized. The
server verifies the test client ID and signs host-only sessions with its own
random `AUTH_SECRET`; production secrets are not copied.

The existing public Koini backend still supplies room-link availability and
privacy/support pages. The iPhone app's Universal Links still use its existing
associated production domains. This test website does not add a second backend,
copy private iPhone exports, or change production records. Search indexing is
disabled on the test copy.

## Resources to remove after testing

- GitHub private repository: `christianzmwang/koini-studio-test`.
- Vercel project: `koini-studio-test`, ID `prj_gG6kymcdh3OSklZRbYxyotbuRqxg`,
  team `christianzmwangs-projects`; deleting it removes its deployments and envs.
- Google OAuth web client: **Koini Studio Test — disposable** in
  `gen-lang-client-0184978152`; delete this client only, keeping the cloud project
  and the existing Studio/Lab3D/Sofia clients.
- Local test checkout: `.local/koini-studio-test` inside the original checkout.

No automatic deletion is scheduled. Keep the environment until testing is
finished, then remove only these resources.
