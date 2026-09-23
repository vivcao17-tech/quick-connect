# Simplify signed-out entry and add Meet sign-in path

## What will change

- Reduce the signed-out home to the NoSure mark, tagline, primary Start action, the new outlined Meet action, sign-in link, and legal/contact links.
- Keep Start account-free. The Meet action will send signed-out visitors to sign-in with `/meet` remembered, while signed-in visitors go directly to Meet.
- Make Google the primary sign-in button and keep email/password as the secondary option.
- Move the four-letter room-code field from the signed-out home to the sign-in screen.
- Default ordinary sign-in to `/people`; preserve explicit safe destinations such as `/meet` through both Google and email sign-in.
- Keep the existing guest-to-account linking behavior unchanged.

## Verification

- Check the signed-out home contains only the requested items and both actions go to the correct places.
- Check the sign-in page shows Google first, email second, and the room-code field.
- Check an existing signed-in session reaches Meet directly and signed-out Meet intent survives sign-in.
- Check desktop and mobile layouts and confirm the relevant pages render without errors.

## Technical details

- Reuse the current managed Google sign-in helper and enable the Google provider in Lovable Cloud.
- Keep redirect destinations same-origin and store the intended route separately during the provider handoff.
- Remove signed-out home data requests that only powered the destinations being removed.
