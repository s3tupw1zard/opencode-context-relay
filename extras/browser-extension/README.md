# Browser context — planned

A later browser extension can feed deliberately minimal context into `browser_context`:

- active tab title + URL/origin
- up to roughly four recently active tabs
- timestamp/device identifier

Default exclusions:

- cookies
- local/session storage
- auth headers
- form fields
- clipboard
- full page text
- hidden/background tab contents

Page content should only be captured by a separate explicit user action if that capability is ever added.
