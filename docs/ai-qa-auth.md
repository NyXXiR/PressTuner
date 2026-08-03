# AI QA authentication

The AI QA authentication gate creates a short-lived browser session for one
dedicated test user and team. It is disabled by default and must not target a
real user or a team containing production data or payment information.

## Safety model

- The route returns `404` unless every required server-only setting is valid.
- The caller cannot choose a user or team. Both are pinned by environment
  configuration and membership is checked again during redemption.
- The issuing endpoint requires a secret of at least 32 non-whitespace
  characters with at least 12 distinct characters.
- Host matching is exact and includes the port when one is present.
- A random ticket is stored only as a SHA-256-derived identifier in the
  existing `session` table.
- A ticket expires within 30–600 seconds and is atomically consumed once.
- The resulting QA session expires within 5 minutes–8 hours.
- Login links and responses use `no-store` and `no-referrer`. The token is never
  written to application logs.
- No Prisma schema change or migration is required.

## Required deployment configuration

Create a dedicated user and isolated team first, then configure:

```dotenv
AI_QA_AUTH_ENABLED=true
AI_QA_AUTH_SECRET=<generate-with-openssl-rand-base64-48>
AI_QA_AUTH_LOGIN_ID=<dedicated-qa-login-id>
AI_QA_AUTH_TEAM_SLUG=<isolated-qa-team-slug>
AI_QA_AUTH_ALLOWED_HOSTS=<deployment-host-without-protocol>
AI_QA_AUTH_TICKET_TTL_SECONDS=120
AI_QA_AUTH_SESSION_TTL_SECONDS=7200
```

Generate the secret outside the repository and keep it in the deployment secret
store:

```bash
openssl rand -base64 48
```

Do not prefix the allowed host with `https://`. For a local instance, include
the port, for example `localhost:3003`. Multiple exact hosts may be separated by
commas.

After changing the deployment configuration, restart or redeploy the App. The
scheduler does not need these variables.

## Issue and use a one-time browser login

The automation controller—not page JavaScript—requests the URL:

```bash
curl --fail-with-body --silent --show-error \
  --request POST "https://<allowed-host>/api/auth/qa/issue" \
  --header "Authorization: Bearer ${AI_QA_AUTH_SECRET}" \
  --header "Content-Type: application/json" \
  --data '{"next":"/dev/api-playground"}'
```

The response has this shape:

```json
{
  "loginUrl": "https://<allowed-host>/api/auth/qa/redeem?token=...&next=...",
  "expiresAt": "2026-07-27T00:00:00.000Z"
}
```

Open `loginUrl` exactly once in the test browser. It sets the HTTP-only `sid`
cookie and redirects to the requested local path. Request a new URL for every
fresh browser context; replaying or using an expired URL returns `404`.

## Automatic non-production playground session

On an allowed host when `NODE_ENV` is anything other than `production`, a fresh
request to the exact `/dev/api-playground` path automatically redirects through
`GET /api/auth/qa/auto`. That route accepts no browser identity, team, or
destination input. It resolves only `AI_QA_AUTH_LOGIN_ID` and
`AI_QA_AUTH_TEAM_SLUG`, requires an active user, active team, valid
`OWNER`/`ADMIN` membership, creates an ordinary database-backed `sid` session
using `AI_QA_AUTH_SESSION_TTL_SECONDS`, and returns to the fixed playground
path. The cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, expires with the
QA session, and is `Secure` for HTTPS requests.

Disabled or invalid configuration, a disallowed host, inactive target, missing
membership, or insufficient role returns a concealed `404` without a cookie.
Automatic bootstrap applies only to the exact playground page: not its
subpaths, APIs, or product routes.

The Press API playground is available outside production. In production it
also requires the dedicated server flag:

```dotenv
ENABLE_DEV_API_PLAYGROUND=true
```

Production never runs automatic bootstrap, even with that flag. Authenticated
admins may open the playground normally, and the one-time issue/redeem ticket
flow above remains the automation login mechanism.

The pinned QA user must belong to the isolated QA team as `OWNER` or `ADMIN`.
While the complete QA auth configuration is enabled and that exact active
OWNER/ADMIN membership remains valid, the pinned team is exempt from both
Press and Resume rolling AI quota rejection. Usage events are still recorded
for observability. The exemption is server-derived from the configured
identity and cannot be requested by page input, cookies, or API payloads.

The combined Press and Resume playgrounds use the same browser API clients and
authenticated domain endpoints as the product flows. Initialization, intake,
generation, verification, status, question-completion, capture, and
application-completion buttons are real operations. AI operations consume real
isolated-team quota and use the configured models. FINAL and Resume completion
transitions can be irreversible.

Each domain defaults to **Screen parity**, which mounts the same Press or Resume
product flow. **Domain inspection** retains the explicit request-by-request
grounding, verification, state, and sanitized exchange sequence. Switching
modes does not pass article or application terminal state into the other mode.

## Persistent RAG fixtures

The Press and Resume fixture cards materialize server-owned QA facts in the
normal PostgreSQL knowledge and career-memory tables. Browser requests can only
choose `mounted: true` or `mounted: false`; they cannot supply text, facts,
fixture IDs, user IDs, or team IDs.

- Press is scoped to the authenticated current team. It creates one
  deterministic READY knowledge document and FACT chunk without an upload
  ledger entry. Mount/unmount increments that team's knowledge corpus version
  once per real transition.
- Resume is scoped to the authenticated current user, including within a shared
  team. It creates one deterministic confirmed experience and trusted facts
  with server-owned user-assertion evidence. Mount/unmount increments only that
  user's career-memory version once per real transition.
- Repeating the requested state is a no-op. Fixture state survives refresh
  because the cards read it from PostgreSQL.
- Unmounting retains documents, facts, evidence, grounding, verification, and
  citations as historical records. Press fixture facts are deactivated on
  unfinished articles and their grounding revisions advance; FINAL articles
  and final citations are unchanged. Resume grounding joins remain intact while
  the archived brick and inactive facts stop participating in retrieval.
- Remounting never silently reaccepts an old Press article fact. Rediscover and
  accept the fixture candidate through the normal grounding API.

Before rolling back or disabling this feature, unmount both fixtures in every
QA team/user scope that used them. Confirm the resource versions advanced, then
remove only the feature code. If the production flag is disabled first, perform
the same scoped visibility changes and version increments in one controlled
transaction; do not delete retained evidence rows. No Prisma migration or
scheduler synchronization is involved.

## Prompt for an AI browser tester

Provide the base URL and the secret through the tester's protected secret
mechanism, then use:

```text
PressTuner의 격리된 QA 팀에서 브라우저 핵심 QA를 수행해줘.

1. POST <BASE_URL>/api/auth/qa/issue 에 Authorization: Bearer <QA_SECRET>와
   JSON {"next":"/dev/api-playground"}를 보내 일회용 loginUrl을 발급한다.
2. loginUrl을 새 브라우저 컨텍스트에서 정확히 한 번 연다.
3. 로그인된 사용자와 팀이 전용 QA 계정인지 확인한다.
4. 제공된 PressTuner QA 실행 순서 중 빠른 테스트 순서를 수행한다.
5. 운영 사용자·결제·팀 설정은 변경하지 않는다.
6. 각 단계의 실제 결과, 근거 페이지, 화면 오류, App/Scheduler 로그 시각을
   기록하고 PASS/WARN/BLOCK으로 보고한다.
7. 테스트 완료 후 세션을 로그아웃하고 생성한 테스트 문서만 정리한다.

비밀값과 loginUrl의 token은 출력, 스크린샷, 로그, 최종 보고서에 남기지 마.
```
