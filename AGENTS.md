<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Personal pack reports

- Keep each personal Click, Talk, and Bring Out report separate from pair previews: read only the viewer's own A/B answers from verified guest/profile participant rows, since a pair's unlock and a person's answer count mean different things.
- Tag report axes on question rows, not answers, and leave semantically ambiguous questions untagged so old answers retain their meaning.

## Impression cards

- Keep the weekly impression set in `weekly_impression_config` and resolve card questions from each card's assigned session questions, so schedule changes never rewrite an answered card.
- Serve card creation, guesses, and owner reads through server functions; never expose guest identifiers or guesses through direct public table access.
- Keep retired product pages available by direct URL while removing only their navigation entries, so historical links remain usable.
