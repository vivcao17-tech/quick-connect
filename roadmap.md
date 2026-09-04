# Roadmap

- [x] Add /auth sign-in page (email+password), redirect back to /admin
- [x] Admin page: session-aware gate with sign-in button when signed out
- [x] Home page: sign-in link reflecting session state
- [x] Diagnose ADMIN_EMAILS mismatch
- [ ] Set ADMIN_EMAILS to the user's actual sign-in address once they confirm it (needs their email)
- [ ] Normalize sessions.kind 'remote_pair' → 'remote' (data + insert + listMyAnswerSets excludes invite child sessions)
- [ ] Person page: show "Send them a set you've already answered" whenever reusable sets exist, not only with zero shared sessions
