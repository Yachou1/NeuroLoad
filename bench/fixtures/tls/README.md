# Synthetic TLS fixture only

This private key and self-signed certificate are public test data for the reserved `.test` names `public.test`, `ministry.gov.test` and `bank.test`. They are not production credentials or a trusted CA. Never install them in a certificate trust store or use them for real services.

Only the isolated automatic-mode browser test uses this certificate, a local DNS mapping and `ignoreHTTPSErrors`. The production extension does not change certificate validation. Other tests keep normal browser certificate checks. No Python or certificate tooling is needed to run the checked-in fixture.
