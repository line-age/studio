import githubMark from "./assets/github.svg"

/** GitHub's mark, for the Sign in with GitHub button only (Figma `425:15690`). */
export function GitHubMark() {
  return (
    <img
      src={githubMark}
      alt=""
      width={16}
      height={16}
      data-icon="inline-start"
    />
  )
}
